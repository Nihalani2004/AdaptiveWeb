from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/adaptiveweb")
DB_NAME = os.getenv("DB_NAME", "adaptiveweb")

class Database:
    client: AsyncIOMotorClient = None
    
    async def connect_db(self):
        self.client = AsyncIOMotorClient(MONGODB_URI)
        print("Connected to MongoDB")
        
    async def close_db(self):
        if self.client:
            self.client.close()
            print("Closed MongoDB connection")
            
    def get_db(self):
        return self.client[DB_NAME]

db = Database()
