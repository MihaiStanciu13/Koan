#!/usr/bin/env python3
"""
Backend Testing Suite for Behavioral Nudge App
Focus: Critical Bug Fix - Email Already Exists Error
"""

import asyncio
import aiohttp
import json
from motor.motor_asyncio import AsyncIOMotorClient
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment
ROOT_DIR = Path(__file__).parent / "backend"
load_dotenv(ROOT_DIR / '.env')

# Configuration
BACKEND_URL = "https://focus-coach-8.preview.emergentagent.com/api"
MONGO_URL = os.getenv('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.getenv('DB_NAME', 'test_database')

# Test data
TEST_EMAIL = "test@example.com"
TEST_PASSWORD = "TestPass123!"
TEST_NAME = "Test User"

class BackendTester:
    def __init__(self):
        self.session = None
        self.mongo_client = None
        self.db = None
        self.test_results = []
        
    async def setup(self):
        """Setup test environment"""
        print("🔧 Setting up test environment...")
        
        # Setup HTTP session
        self.session = aiohttp.ClientSession()
        
        # Setup MongoDB connection
        self.mongo_client = AsyncIOMotorClient(MONGO_URL)
        self.db = self.mongo_client[DB_NAME]
        
        print(f"✅ Connected to MongoDB: {MONGO_URL}")
        print(f"✅ Using database: {DB_NAME}")
        print(f"✅ Backend URL: {BACKEND_URL}")
        
    async def cleanup(self):
        """Cleanup test environment"""
        if self.session:
            await self.session.close()
        if self.mongo_client:
            self.mongo_client.close()
            
    async def clear_test_database(self):
        """Clear all test data from database"""
        print("\n🧹 Clearing test database completely...")
        
        try:
            # Clear all collections
            collections = await self.db.list_collection_names()
            for collection_name in collections:
                result = await self.db[collection_name].delete_many({})
                print(f"   Cleared {result.deleted_count} documents from {collection_name}")
            
            print("✅ Database cleared successfully")
            return True
        except Exception as e:
            print(f"❌ Failed to clear database: {str(e)}")
            return False
            
    async def test_health_check(self):
        """Test API health check"""
        print("\n🏥 Testing API health check...")
        
        try:
            async with self.session.get(f"{BACKEND_URL}/health") as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"✅ Health check passed: {data}")
                    return True
                else:
                    print(f"❌ Health check failed: {response.status}")
                    return False
        except Exception as e:
            print(f"❌ Health check error: {str(e)}")
            return False
            
    async def test_signup(self, email, password, name, should_succeed=True):
        """Test user signup"""
        print(f"\n📝 Testing signup with email: {email}")
        
        payload = {
            "email": email,
            "password": password,
            "name": name
        }
        
        try:
            async with self.session.post(
                f"{BACKEND_URL}/auth/signup",
                json=payload,
                headers={"Content-Type": "application/json"}
            ) as response:
                
                response_data = await response.json()
                
                if should_succeed:
                    if response.status == 200:
                        print(f"✅ Signup succeeded: {response_data.get('user', {}).get('email')}")
                        print(f"   Token received: {response_data.get('access_token', 'N/A')[:20]}...")
                        return True, response_data
                    else:
                        print(f"❌ Signup failed unexpectedly: {response.status} - {response_data}")
                        return False, response_data
                else:
                    if response.status == 400 and "already registered" in response_data.get('detail', '').lower():
                        print(f"✅ Signup correctly rejected: {response_data.get('detail')}")
                        return True, response_data
                    else:
                        print(f"❌ Signup should have failed but didn't: {response.status} - {response_data}")
                        return False, response_data
                        
        except Exception as e:
            print(f"❌ Signup error: {str(e)}")
            return False, {"error": str(e)}
            
    async def test_login(self, email, password, should_succeed=True):
        """Test user login"""
        print(f"\n🔐 Testing login with email: {email}")
        
        payload = {
            "email": email,
            "password": password
        }
        
        try:
            async with self.session.post(
                f"{BACKEND_URL}/auth/login",
                json=payload,
                headers={"Content-Type": "application/json"}
            ) as response:
                
                response_data = await response.json()
                
                if should_succeed:
                    if response.status == 200:
                        print(f"✅ Login succeeded: {response_data.get('user', {}).get('email')}")
                        print(f"   Token received: {response_data.get('access_token', 'N/A')[:20]}...")
                        return True, response_data
                    else:
                        print(f"❌ Login failed: {response.status} - {response_data}")
                        return False, response_data
                else:
                    if response.status == 401:
                        print(f"✅ Login correctly rejected: {response_data.get('detail')}")
                        return True, response_data
                    else:
                        print(f"❌ Login should have failed but didn't: {response.status} - {response_data}")
                        return False, response_data
                        
        except Exception as e:
            print(f"❌ Login error: {str(e)}")
            return False, {"error": str(e)}
            
    async def manually_delete_user(self, email):
        """Manually delete user from database"""
        print(f"\n🗑️ Manually deleting user: {email}")
        
        try:
            # Delete from users collection
            user_result = await self.db.users.delete_many({"email": email})
            print(f"   Deleted {user_result.deleted_count} users")
            
            # Also delete preferences if they exist
            prefs_result = await self.db.preferences.delete_many({"user_id": {"$exists": True}})
            print(f"   Deleted {prefs_result.deleted_count} preferences")
            
            print("✅ User deleted successfully")
            return True
        except Exception as e:
            print(f"❌ Failed to delete user: {str(e)}")
            return False
            
    async def verify_jwt_token(self, token):
        """Verify JWT token by calling /auth/me endpoint"""
        print(f"\n🎫 Verifying JWT token...")
        
        try:
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }
            
            async with self.session.get(f"{BACKEND_URL}/auth/me", headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    print(f"✅ Token valid: User {data.get('email')} authenticated")
                    return True, data
                else:
                    response_data = await response.json()
                    print(f"❌ Token invalid: {response.status} - {response_data}")
                    return False, response_data
                    
        except Exception as e:
            print(f"❌ Token verification error: {str(e)}")
            return False, {"error": str(e)}
            
    async def run_critical_bug_test(self):
        """Run the critical bug test sequence"""
        print("\n" + "="*60)
        print("🚨 CRITICAL BUG TEST: Email Already Exists Error")
        print("="*60)
        
        test_passed = True
        
        # Step 1: Clear database completely
        if not await self.clear_test_database():
            test_passed = False
            
        # Step 2: Test initial signup - should succeed
        success, signup_data = await self.test_signup(TEST_EMAIL, TEST_PASSWORD, TEST_NAME, should_succeed=True)
        if not success:
            test_passed = False
        else:
            # Verify JWT token
            token = signup_data.get('access_token')
            if token:
                token_valid, _ = await self.verify_jwt_token(token)
                if not token_valid:
                    test_passed = False
                    
        # Step 3: Test duplicate signup - should fail
        success, _ = await self.test_signup(TEST_EMAIL, TEST_PASSWORD, TEST_NAME, should_succeed=False)
        if not success:
            test_passed = False
            
        # Step 4: Manually delete user
        if not await self.manually_delete_user(TEST_EMAIL):
            test_passed = False
            
        # Step 5: CRITICAL TEST - signup with same email should now succeed
        print("\n🎯 CRITICAL TEST: Signup after manual deletion")
        success, signup_data2 = await self.test_signup(TEST_EMAIL, TEST_PASSWORD, TEST_NAME, should_succeed=True)
        if not success:
            print("❌ CRITICAL BUG STILL EXISTS: Cannot reuse email after deletion")
            test_passed = False
        else:
            print("✅ CRITICAL BUG FIXED: Can reuse email after deletion")
            
        return test_passed
        
    async def run_auth_functionality_tests(self):
        """Run basic auth functionality tests"""
        print("\n" + "="*60)
        print("🔐 AUTH FUNCTIONALITY TESTS")
        print("="*60)
        
        test_passed = True
        
        # Test login with valid credentials
        success, login_data = await self.test_login(TEST_EMAIL, TEST_PASSWORD, should_succeed=True)
        if not success:
            test_passed = False
        else:
            # Verify JWT token from login
            token = login_data.get('access_token')
            if token:
                token_valid, _ = await self.verify_jwt_token(token)
                if not token_valid:
                    test_passed = False
                    
        # Test login with invalid credentials
        success, _ = await self.test_login(TEST_EMAIL, "WrongPassword123!", should_succeed=False)
        if not success:
            test_passed = False
            
        # Test login with non-existent email
        success, _ = await self.test_login("nonexistent@example.com", TEST_PASSWORD, should_succeed=False)
        if not success:
            test_passed = False
            
        return test_passed
        
    async def run_all_tests(self):
        """Run all backend tests"""
        print("🚀 Starting Backend Testing Suite")
        print(f"Target: {BACKEND_URL}")
        print(f"Database: {DB_NAME}")
        
        all_tests_passed = True
        
        # Health check
        if not await self.test_health_check():
            all_tests_passed = False
            
        # Critical bug test
        if not await self.run_critical_bug_test():
            all_tests_passed = False
            
        # Auth functionality tests
        if not await self.run_auth_functionality_tests():
            all_tests_passed = False
            
        # Final summary
        print("\n" + "="*60)
        if all_tests_passed:
            print("✅ ALL TESTS PASSED")
        else:
            print("❌ SOME TESTS FAILED")
        print("="*60)
        
        return all_tests_passed

async def main():
    """Main test runner"""
    tester = BackendTester()
    
    try:
        await tester.setup()
        success = await tester.run_all_tests()
        return success
    finally:
        await tester.cleanup()

if __name__ == "__main__":
    success = asyncio.run(main())
    exit(0 if success else 1)