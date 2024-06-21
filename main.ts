import { serve } from "https://deno.land/std@0.152.0/http/server.ts";
import { Hono } from "npm:hono";
import { load } from "https://deno.land/std/dotenv/mod.ts";
import { federationMiddleware, fedi, sendNote } from "./federation.ts";



const app = new Hono();

// Load environment variables from .env file
const env = await load(); 
const window = 10;
let db: any;
let connectDB: any;
const dbType = env["DB_TYPE"];

if (dbType === 'mongodb') {
  const module = await import('./db/mongodb.ts');
  connectDB = module.connectDB;
  db = module.db;

  try {
    await connectDB();
  } catch (error) {
    console.error('Failed to connect to MongoDB', error);
    Deno.exit(1);
  }
} else {
  console.error('No valid database type specified');
  Deno.exit(1);
}

app.use(federationMiddleware);  
  

app.get('/', (c) => c.text('Hono meets Node.js'))

app.get('/users/fresh7at7', (c) => c.text('Hono meets Node.js'));
app.get('/@fresh7at7', (c) => c.text('Hono meets Node.js'));

// Endpoint to handle the POST request
app.post('/send', async (c) => {
  const { senderHandle, recipient, type, message } = await c.req.json();
  const ctx = fedi.createContext(c.req.raw, undefined);

  
  // Call sendNote function
  await sendNote(ctx, senderHandle, recipient, type, message);
  
  return c.json({ status: 'success' });
});


serve(app.fetch, { port: 9810 });