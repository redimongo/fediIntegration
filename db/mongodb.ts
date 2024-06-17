import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts";
import { MongoClient, Db, Collection, ObjectId, InsertOneResult, WithId } from "npm:mongodb@6.1.0";

// Load environment variables
const env = await load();

const client = new MongoClient(env["MONGODB_URI"]);

let db: Db;

const connectDB = async (): Promise<void> => {
  await client.connect();
  db = client.db(env["MONGODB_DB"]);
  console.log('MongoDB connected');
};

const excludedFields = {
  _id: 0,
  smtp: 0,
  sendgridApiKey: 0,
  mailServer: 0,
  mailUsername: 0,
  mailPassword: 0,
};

const excludedUserFields = {
  password: 0,
  email: 0,
  secretKey: 0,
};

const excludedUserKeyFields = {
  secretKey: 1,
};

const checkPerformanceSettings = async (): Promise<boolean> => {
  const collections = await db.collections();
  const collectionNames = collections.map(col => col.collectionName);
  return collectionNames.includes('podcast_performance_settings');
};

const checkPerformance = async (data: Record<string, any>): Promise<WithId<any> | null> => {
  if (!db) throw new Error('Database not initialized');
  const collection: Collection = db.collection('podcast_performance_settings');
  const result = await collection.findOne(data, { projection: excludedFields });
  return result;
};

const settingsInsertDocument = async (data: Record<string, any>): Promise<InsertOneResult<WithId<any>>> => {
  if (!db) throw new Error('Database not initialized');
  const collection: Collection = db.collection('podcast_performance_settings');
  const result = await collection.insertOne(data);
  return result;
};

const insertUserSalt = async (data: Record<string, any>): Promise<InsertOneResult<WithId<any>>> => {
  if (!db) throw new Error('Database not initialized');
  const collection: Collection = db.collection('podcast_performance_user_salts');
  const result = await collection.insertOne(data);
  return result;
};

const createUser = async (data: Record<string, any>): Promise<InsertOneResult<WithId<any>>> => {
  if (!db) throw new Error('Database not initialized');
  const collection: Collection = db.collection('podcast_performance_users');
  const result = await collection.insertOne(data);
  return result;
};

const findUser = async (data: Record<string, any>): Promise<WithId<any> | null> => {
  if (!db) throw new Error('Database not initialized');
  const collection: Collection = db.collection('podcast_performance_users');
  const result = await collection.findOne(data);
  return result;
};

const updateUser = async (username: string, data: any): Promise<WithId<any> | null> => {
  if (!db) throw new Error('Database not initialized');
  const user = await db.collection('podcast_performance_users').findOne({ username: username }, { projection: excludedUserFields });

  if (!user) {
    throw new Error('User not found');
  }


    await db.collection('podcast_performance_users').updateOne(
      { _id: new ObjectId(user._id) },
      { $set: data }
    );
    console.log('Follower removed successfully');

  const updatedUser = await db.collection('podcast_performance_users').findOne({ _id: new ObjectId(user._id) });
  return updatedUser;
};


const addFollower = async(username: string, follower: any): Promise<WithId<any> | null> => {
  if (!db) throw new Error('Database not initialized');

  const user = await db.collection('podcast_performance_users').findOne({ username }, { projection: excludedUserFields });
  // Isn't the user._id derived from the username, "fresh7at7"? YES
  

  if (!user) {
    throw new Error('User not found');
  }

  const followerExists = await db.collection('podcast_performance_followers').findOne({
    userId: new ObjectId(user._id),
    'follower.id': follower.id,
  });

  if (followerExists) {
    console.log('Follower already exists in the list');
  } else {
    await db.collection('podcast_performance_followers').insertOne({
      userId: new ObjectId(user._id),
      follower, // one second
    });
    console.log('Follower added successfully');
  }

  const updatedFollowers = await db.collection('podcast_performance_followers').find({ userId: new ObjectId(user._id) }).toArray();
  return updatedFollowers;
}

const followUser = async (username: string, followerUrl: string, actorId: string): Promise<WithId<any> | null> => {
  if (!db) throw new Error('Database not initialized');

  const user = await db.collection('podcast_performance_users').findOne({ username: username }, { projection: excludedUserFields });

  if (!user) {
    throw new Error('User not found');
  }

  const followerExists = await db.collection('podcast_performance_users').findOne({
    _id: new ObjectId(user._id),
    followers: {
      $elemMatch: {
        actorId: actorId,
      }
    }
  });

  if (followerExists) {
    console.log('Follower already exists in the list');
  } else {
    await db.collection('podcast_performance_users').updateOne(
      { _id: new ObjectId(user._id) },
      { $push: { 'followers': { followerUrl, actorId } } }
    );
    console.log('Follower added successfully');
  }

  const updatedUser = await db.collection('podcast_performance_users').findOne({ _id: new ObjectId(user._id) }, { projection: excludedUserFields });
  return updatedUser;
};


const unFollowUser = async (username: string, followerUrl: string, actorId: string): Promise<WithId<any> | null> => {
  if (!db) throw new Error('Database not initialized');

  const user = await db.collection('podcast_performance_users').findOne({ username: username }, { projection: excludedUserFields });

  if (!user) {
    throw new Error('User not found');
  }

  const followerExists = await db.collection('podcast_performance_users').findOne({
    _id: new ObjectId(user._id),
    followers: {
      $elemMatch: {
        followerUrl: followerUrl,
        actorId: actorId,
      }
    }
  });

  if (followerExists) {
    await db.collection('podcast_performance_users').updateOne(
      { _id: new ObjectId(user._id) },
      { $pull: { 'followers': { followerUrl, actorId } } }
    );
    console.log('Follower removed successfully');
  } else {
    console.log('Follower does not exist in the list');
  }

  const updatedUser = await db.collection('podcast_performance_users').findOne({ _id: new ObjectId(user._id) }, { projection: excludedUserFields });
  return updatedUser;
};

const getFollowersByUserHandle = async (handle: string, page: number, limit: number = 10): Promise<any> => {
  const userDB = await db.collection('podcast_performance_users').findOne({ "username":"fresh7at7" }, { projection: excludedUserFields });

  if(!userDB){
    console.log("NO USER FOUND")
    return; // maybe it's better to throw an error here?
  }
  
  const collection: Collection = db.collection('podcast_performance_followers');
  const usersCursor = await collection.find({ "userId": new ObjectId(userDB._id) }); // Then let's rename this to users
  const users = await usersCursor.toArray();
  console.log(JSON.stringify(users));
  if (!users) { 
    return { users: [], totalItems: 0, nextPage: null, last: true };
  }

  const totalItems = await collection.countDocuments({ "userId": new ObjectId(userDB._id) });
  // const startIndex = (page - 1) * limit;
  // const followers = users.slice(startIndex, startIndex + limit);
  // const nextPage = startIndex + limit < totalItems ? page + 1 : null;
  // const last = startIndex + limit >= totalItems;

  return { users: users, totalItems, nextPage: null, last: null };
};


const saveToken = async (data: Record<string, any>): Promise<InsertOneResult<WithId<any>>> => {
  if (!db) throw new Error('Database not initialized');
  const collection: Collection = db.collection('podcast_performance_token');
  const result = await collection.insertOne(data);
  return result;
};

const getToken = async (data: Record<string, any>): Promise<WithId<any> | null> => {
  if (!db) throw new Error('Database not initialized');
  const collection: Collection = db.collection('podcast_performance_token');
  const result = await collection.findOne(data);
  return result;
};

const insertDocument = async (data: Record<string, any>): Promise<InsertOneResult<WithId<any>>> => {
  if (!db) throw new Error('Database not initialized');
  const collection: Collection = db.collection('episode_performance');
  const result = await collection.insertOne(data);
  return result;
};

const upsertDocument = async (filter: Record<string, any>, data: Record<string, any>): Promise<any> => {
  if (!db) throw new Error('Database not initialized');
  const collection: Collection = db.collection('episode_performance');
  const result = await collection.updateOne(filter, { $set: data }, { upsert: true });
  return result;
};

const checkEpisodeGUID = async (data: Record<string, any>): Promise<WithId<any> | null> => {
  if (!db) throw new Error('Database not initialized');
  const collections = Deno.env.get("MONGODB_EPISODE_DB")!.split(',');

  for (const collectionName of collections) {
    const collection: Collection = db.collection(collectionName.trim());
    const result = await collection.findOne(data);
    if (result) {
      return result;
    }
  }

  return null;
};

const getPerformanceData = async (data: Record<string, any>): Promise<WithId<any> | null> => {
  if (!db) throw new Error('Database not initialized');
  const collection: Collection = db.collection('episode_performance');
  const result = await collection.find(data).toArray();
  return result;
};

/* ACTIVITY PUB */
const insertActivity = async (data: Record<string, any>): Promise<InsertOneResult<WithId<any>>> => {
  if (!db) throw new Error('Database not initialized');
  const collection: Collection = db.collection('podcast_performance_activity_note');
  const result = await collection.insertOne(data);
  return result;
};

const updateActivity = async (filter: Record<string, any>, data: Record<string, any>): Promise<any> => {
  if (!db) throw new Error('Database not initialized');
  const collection: Collection = db.collection('podcast_performance_activity_note');
  const result = await collection.updateOne(filter, { $set: data }, { upsert: true });
  return result;
};


const countPostsByUserHandle = async (username: string): Promise<any> => {
  if (!db) throw new Error('Database not initialized');
 
  const user = await findUser({"username":username})
  if(!user){
    return null
  }

  const posts = await db.collection('podcast_performance_activity_note').countDocuments({'userId': new ObjectId(user._id), 'me':true});

  if (!posts) {
    return 0;
  }

  return posts;
 
};

const countFollowersByUserHandle = async (username: string): Promise<any> => {
  if (!db) throw new Error('Database not initialized');
  const user = await db.collection('podcast_performance_users').findOne({"username":username});
 
  if(!user){
    throw new Error("NO USER");
  }
  const followers = await db.collection('podcast_performance_followers').countDocuments({"userId": new ObjectId(user._id)});
  if(!followers){
    return 0
  }
  
  return followers;


 
};

async function getPostsByUserHandle(userId: ObjectId, options: { cursor?: any, limit: number }): Promise<{ posts: any[], nextCursor: string | null, last: boolean }> {
  if (!db) throw new Error('Database not initialized');
  
 
  // Find the posts for the user
  const postsCollection = db.collection('podcast_performance_activity_note');
  const postsCursor = postsCollection.find({ userId, 'me': true})
    .sort({ _id: 1 });
  const posts = await postsCursor.toArray();
  
  const nextCursor = posts.length === options.limit ? posts[posts.length - 1]._id.toString() : null;
  const last = nextCursor === null;

  return { posts, nextCursor, last };
}

/* KEY-VALUE STORE FUNCTIONS */
const kvGet = async (key: string): Promise<any> => {
  if (!db) throw new Error('Database not initialized');
  const kvCollection = db.collection('podcast_performance_kv_store');
  const entry = await kvCollection.findOne({ key });
  return entry ? entry.value : null;
};

const kvSet = async (key: string, value: any): Promise<void> => {
  if (!db) throw new Error('Database not initialized');
  const kvCollection = db.collection('podcast_performance_kv_store');
  await kvCollection.updateOne(
    { key },
    { $set: { key, value } },
    { upsert: true }
  );
};

export {
  connectDB,
  checkPerformance,
  checkPerformanceSettings,
  settingsInsertDocument,
  insertUserSalt,
  createUser,
  updateUser,
  findUser,
  addFollower,
  followUser,
  unFollowUser,
  getFollowersByUserHandle,
  getPostsByUserHandle,
  countFollowersByUserHandle,
  countPostsByUserHandle,
  saveToken,
  getToken,
  insertDocument,
  upsertDocument,
  checkEpisodeGUID,
  getPerformanceData,
  insertActivity,
  updateActivity,
  kvGet,
  kvSet
  // Add other MongoDB functions as needed
};
