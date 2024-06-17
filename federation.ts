import { Federation, Article, Create, Accept, Person, Group, Follow, exportJwk, generateCryptoKeyPair, importJwk, MemoryKvStore, Image, PropertyValue, PUBLIC_COLLECTION, Recipient, Context, Note, InProcessMessageQueue, getActorHandle, getActorTypeName, Link, RequestContext } from "@fedify/fedify";
import { federation } from "@fedify/fedify/x/hono";
import { addFollower, countFollowersByUserHandle, countPostsByUserHandle, findUser, followUser, getFollowersByUserHandle, getPostsByUserHandle, kvGet, kvSet, updateUser } from "./db/mongodb.ts";

// Load environment variables from .env file
const window = 10;


async function fetchData(url: string) {
  const response = await fetch(url, {
    headers: {
      "Accept": "application/activity+json",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch data from ${url}: ${response.statusText}`);
  }
  return await response.json();
}

  
  export const fedi = new Federation<void>({
    kv: {
      get: kvGet,
      set: kvSet,
    },
    treatHttps: true,
    signatureTimeWindow: { minutes: 5 },
    queue: new InProcessMessageQueue(), 
    onOutboxError: (error, activity) => {
      console.log("Failed to deliver an activity:", error);
      console.log("Activity:", activity);
    },
  });

  fedi.setNodeInfoDispatcher("/nodeinfo/2.1", async (ctx) => {
    return {
      software: {
        name: "podcast-peformance",  // Lowercase, digits, and hyphens only.
        version: { major: 1, minor: 0, patch: 4 },
        homepage: new URL("https://podcastperformance.com/"),
      },
      protocols: ["activitypub"],
      usage: {
        // Usage statistics is hard-coded here for demonstration purposes.
        // You should replace these with real statistics:
        users: { total: 100, activeHalfyear: 50, activeMonth: 20 },
        localPosts: 1000,
        localComments: 2000,
      }
    }
  });

  fedi.setActorDispatcher("/users/{handle}", async (ctx, handle, key) => {
      let userKey = await findUser({ "username": handle });
      if (!userKey) return null;

      let actor;
      let actorIcon;
      let actorImage;
      let actorAttachments = [];
      // Add icon if it exists
      if (userKey.iconPic) {
        actorIcon = new Image({
          mediaType: userKey.iconPic.type,
          url: new URL(userKey.iconPic.url),
        });
      }
      // Add image if it exists
      if (userKey.image) {
        actorImage = new Image({
          mediaType: userKey.image.type,
          url: new URL(userKey.image.url),
        });
      }
      // Add attachments if they exist
      if (userKey.attachment && Array.isArray(userKey.attachment)) {
        actorAttachments = userKey.attachment.map(att => new PropertyValue({
          name: att.name,
          value: att.value,
        }));
      }

      if (userKey.type === "Person") {
        actor = new Person({
          id: ctx.getActorUri(handle),
          name: userKey.name,
          summary: "This is me!",
          preferredUsername: handle,
          url: new URL(`/@${handle}`, ctx.url),
          inbox: ctx.getInboxUri(handle),
          outbox: ctx.getOutboxUri(handle),
          followers: ctx.getFollowersUri(handle),
          icon: actorIcon,
          image: actorImage,
          attachments: actorAttachments,
          discoverable:true,
          indexable:true,
          publicKey: key,  // The public key of the actor; it's provided by the key
                           // pair dispatcher we define below
        });
      } else if (userKey.type === "Group") {
        actor = new Group({
          id: ctx.getActorUri(handle),
          name: userKey.name,
          summary: "This is a group!",
          preferredUsername: handle,
          url: new URL(`/@${handle}`, ctx.url),
          inbox: ctx.getInboxUri(handle),
          outbox: ctx.getOutboxUri(handle),
          followers: ctx.getFollowersUri(handle),
          icon: actorIcon,
          image: actorImage,
          attachments: actorAttachments,
          discoverable:true,
          indexable:true,
          publicKey: key,  // The public key of the actor; it's provided by the key
                           // pair dispatcher we define below
        });
      } else {
        console.error(`Unknown user type: ${userKey.type}`);
        return null;
      }

      return actor;
    })
    .setKeyPairDispatcher(async (ctx, handle) => {
      let userKey = await findUser({ "username": handle });
      /*if (userKey.privateKey.kty == null) {
        // Generate a new key pair at the first time:
        const { privateKey, publicKey } = await generateCryptoKeyPair();
        const privateKeyJwk = await exportJwk(privateKey);
        const publicKeyJwk = await exportJwk(publicKey);

        // Store the generated key pair to the MongoDB in JWK format:
        userKey = await updateUser(
          handle,
          { privateKey: privateKeyJwk, publicKey: publicKeyJwk }
        );
        return { privateKey, publicKey };  
      }*/
      // Load the key pair from the MongoDB:
      const privateKey = await importJwk(userKey.privateKey, "private");
      const publicKey = await importJwk(userKey.publicKey, "public");
      return { privateKey, publicKey };
    })
    
    fedi
  .setOutboxDispatcher("/users/{handle}/outbox", async (ctx, handle, cursor) => {
    if (cursor == null) return null;
    // Here we use the offset numeric value as the cursor:
    let userKey = await findUser({ "username": handle });
    const offset = parseInt(cursor);
    // The following `getPostsByUserHandle` is a hypothetical function:
    const { posts, nextCursor, last } = await getPostsByUserHandle(userKey._id, { offset, limit: window });
  // Turn the posts into `Create` activities:
    const items = posts.map(post =>
      new Create({
        id: new URL(`/posts/${post._id}#activity`, ctx.url),
        actor: ctx.getActorUri(handle),
        object: new Article({
          id: new URL(`/users/${handle}/notes/${post._id}`, ctx.url),
          summary: "test",
          content: post.content,
        }),
      })
    );
    return { items, nextCursor: (offset + window).toString() }
  })
  .setCounter(async (ctx, handle) => {
    // Use static array to count posts for testing
    return await countPostsByUserHandle(handle);
  })
  .setFirstCursor(async (ctx, handle) => "0")
  .setLastCursor(async (ctx, handle) => {
    return await countPostsByUserHandle(handle);
  });
    
  fedi
  .setFollowersDispatcher("/users/{handle}/followers", async (ctx, handle, pageParam) => {
    const page = pageParam ? parseInt(pageParam) : 1;

    //Retrieve followers
    const { users, totalItems, nextPage, last } = await getFollowersByUserHandle(handle, 0, 10);
    console.log({totalItems, users}); // users are empty
    const items = users.map((doc: any) => ({
      id: new URL(doc.follower.url),
      inboxId: new URL(doc.follower.inbox),
      endpoints: {
        sharedInbox: new URL(doc.follower.sharedInbox),
      }
    }));


    return {
      "@context": "https://www.w3.org/ns/activitystreams",
      id: ctx.getFollowersUri(handle),
      type: "OrderedCollection",
      totalItems,
      first: `${ctx.getFollowersUri(handle)}?page=1`,
      last: last ? `${ctx.getFollowersUri(handle)}?page=${page}` : null,
      items,
      next: nextPage ? `${ctx.getFollowersUri(handle)}?page=${nextPage}` : null
    };
  })
  .setCounter(async (ctx, handle) => {
    // Use static array to count posts for testing
    return await countFollowersByUserHandle(handle);
  })
  // The first page is page 1:
  .setFirstCursor(async (ctx, handle) => "1");

    

  fedi
    .setInboxListeners("/users/{handle}/inbox", "/inbox")
    .on(Create, async (ctx, create) => {
      console.log("Received Create Activity:");
      console.log(JSON.stringify(create, null, 2));  // Log the entire Create activity
      
      const noteis = await fetchData(create.id);
      console.log(JSON.stringify(noteis));
    })
    .on(Follow, async (ctx, follow) => {
      if (follow.id == null || follow.objectId == null) return;
      const parsed = ctx.parseUri(follow.objectId);
      console.log(JSON.stringify(parsed));
      if (parsed?.type !== "actor") return;
      const recipient = await follow.getActor(ctx);
      console.log(recipient); // This does not have inboxId

      if (
        recipient == null || recipient.id == null ||
        recipient.preferredUsername == null ||
        recipient.inboxId == null
      ) return; // which makes this return and stop.

      const handle = await getActorHandle(recipient);
      console.log(handle); // This printed out: @begutin_acigran@activitypub.academy
      await addFollower(parsed.handle, {
        activityId: follow.id.href,
        id: recipient.id.href,
        name: recipient.name?.toString() ?? "",
        url: getHref(recipient.url) ?? recipient.id.href,
        handle,
        inbox: recipient.inboxId.href,
        sharedInbox: recipient.endpoints?.sharedInbox?.href,
        typeName: getActorTypeName(recipient),
      });
      // Note that if a server receives a `Follow` activity, it should reply
      // with either an `Accept` or a `Reject` activity.  In this case, the
      // server automatically accepts the follow request:
      await ctx.sendActivity(
        { handle: parsed.handle },
        recipient,
        new Accept({ actor: follow.objectId, object: follow }),
      );
    });


    fedi.setObjectDispatcher(
      Note,
      "/users/{handle}/notes/{id}",
      async (ctx, { handle, id }) => {
        // Work with the database to find the note by the author's handle and the note ID.
        //if (note == null) return null;  // Return null if the note is not found.
        return new Note({
          id: ctx.getObjectUri(Note, { handle, id }),
          sensitive:false,
          content: "hello",
          // Many more properties...
        });
      }
    );


    /*** 
     * BACKEND TO SEND ACTIONS
     * ***/

    export async function sendNote(
      ctx: RequestContext<void>,
      senderHandle: string,
      recipient: Recipient,
      message: string
    ) {
      console.log("Sender Handle:", senderHandle);
      console.log("Recipient:", recipient);
      
    

      await ctx.sendActivity(
        { handle: senderHandle },
        "followers",
        new Create({
          actor: ctx.getActorUri(senderHandle),
          to: ctx.getFollowersUri(senderHandle),
          object: new Note({
            attribution: ctx.getActorUri(senderHandle),
            to: ctx.getFollowersUri(senderHandle),
            content: message, // Add the message content here
           
          }),
        }),
        {
          immediate: true,
          preferSharedInbox: true,
          excludeBaseUris: [ctx.getInboxUri()],
        }
      );

    }
   
    function getHref(link: Link | URL | string | null): string | null {
      if (link == null) return null;
      if (link instanceof Link) return link.href?.href ?? null;
      if (link instanceof URL) return link.href;
      return link;
    }

    export const federationMiddleware = federation(fedi, (ctx) => "context data");