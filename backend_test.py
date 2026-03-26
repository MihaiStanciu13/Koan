#!/usr/bin/env python3
"""
Comprehensive Backend Testing for Adaptive Nudge Engine + Auth
Tests Priority 1: Auth, Priority 2: Adaptive Nudge Engine, Priority 3: Preferences
"""

import requests
import json
import uuid
from datetime import datetime
import time

# Backend URL from frontend .env
BACKEND_URL = "https://koan-dev-build.preview.emergentagent.com/api"

class BackendTester:
    def __init__(self):
        self.base_url = BACKEND_URL
        self.auth_token = None
        self.user_id = None
        self.test_email = f"comprehensive_test_final_{uuid.uuid4().hex[:8]}@example.com"
        self.test_password = "TestPass123!"
        self.test_name = "Test User Final"
        
    def log(self, message):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")
        
    def test_health_check(self):
        """Test basic connectivity"""
        self.log("Testing health check...")
        try:
            response = requests.get(f"{self.base_url}/health", timeout=10)
            if response.status_code == 200:
                self.log("✅ Health check passed")
                return True
            else:
                self.log(f"❌ Health check failed: {response.status_code}")
                return False
        except Exception as e:
            self.log(f"❌ Health check error: {str(e)}")
            return False
    
    def test_auth_signup(self):
        """Priority 1: Test signup with fresh email"""
        self.log(f"Testing signup with email: {self.test_email}")
        
        signup_data = {
            "email": self.test_email,
            "password": self.test_password,
            "name": self.test_name
        }
        
        try:
            response = requests.post(
                f"{self.base_url}/auth/signup",
                json=signup_data,
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            
            self.log(f"Signup response status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                self.auth_token = data.get("access_token")
                self.user_id = data.get("user", {}).get("id")
                self.log("✅ Signup successful - 200 OK")
                self.log(f"✅ JWT token received: {self.auth_token[:20]}...")
                self.log(f"✅ User ID: {self.user_id}")
                return True
            else:
                self.log(f"❌ Signup failed: {response.status_code}")
                self.log(f"❌ Response: {response.text}")
                return False
                
        except Exception as e:
            self.log(f"❌ Signup error: {str(e)}")
            return False
    
    def test_auth_login(self):
        """Priority 1: Test login with same credentials"""
        self.log("Testing login with same credentials...")
        
        login_data = {
            "email": self.test_email,
            "password": self.test_password
        }
        
        try:
            response = requests.post(
                f"{self.base_url}/auth/login",
                json=login_data,
                headers={"Content-Type": "application/json"},
                timeout=10
            )
            
            self.log(f"Login response status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                login_token = data.get("access_token")
                self.log("✅ Login successful")
                self.log(f"✅ JWT token received: {login_token[:20]}...")
                return True
            else:
                self.log(f"❌ Login failed: {response.status_code}")
                self.log(f"❌ Response: {response.text}")
                return False
                
        except Exception as e:
            self.log(f"❌ Login error: {str(e)}")
            return False
    
    def test_jwt_verification(self):
        """Priority 1: Verify JWT tokens work"""
        self.log("Testing JWT token verification...")
        
        if not self.auth_token:
            self.log("❌ No auth token available for verification")
            return False
        
        headers = {
            "Authorization": f"Bearer {self.auth_token}",
            "Content-Type": "application/json"
        }
        
        try:
            response = requests.get(
                f"{self.base_url}/auth/me",
                headers=headers,
                timeout=10
            )
            
            self.log(f"JWT verification response status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                self.log("✅ JWT verification successful")
                self.log(f"✅ User data: {data.get('email')}")
                return True
            else:
                self.log(f"❌ JWT verification failed: {response.status_code}")
                self.log(f"❌ Response: {response.text}")
                return False
                
        except Exception as e:
            self.log(f"❌ JWT verification error: {str(e)}")
            return False
    
    def test_adaptive_nudge_evaluate(self):
        """Priority 2: Test POST /api/adaptive-nudges/evaluate"""
        self.log("Testing adaptive nudge evaluation...")
        
        if not self.auth_token:
            self.log("❌ No auth token for adaptive nudge test")
            return False
        
        headers = {
            "Authorization": f"Bearer {self.auth_token}",
            "Content-Type": "application/json"
        }
        
        # Test signal data
        signal_data = {
            "signal_type": "excessive_pickups",
            "strength": 0.8,
            "metadata": {
                "pickup_count": 7,
                "test": True
            }
        }
        
        try:
            response = requests.post(
                f"{self.base_url}/adaptive-nudges/evaluate",
                json=signal_data,
                headers=headers,
                timeout=10
            )
            
            self.log(f"Adaptive nudge evaluate response status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                self.log("✅ Adaptive nudge evaluate successful")
                self.log(f"✅ Response: {data.get('status')}")
                if data.get('nudge'):
                    self.log(f"✅ Nudge created: {data['nudge'].get('message', 'No message')}")
                return True
            else:
                self.log(f"❌ Adaptive nudge evaluate failed: {response.status_code}")
                self.log(f"❌ Response: {response.text}")
                return False
                
        except Exception as e:
            self.log(f"❌ Adaptive nudge evaluate error: {str(e)}")
            return False
    
    def test_adaptive_nudge_fallback(self):
        """Priority 2: Test GET /api/adaptive-nudges/fallback"""
        self.log("Testing adaptive nudge fallback...")
        
        if not self.auth_token:
            self.log("❌ No auth token for fallback test")
            return False
        
        headers = {
            "Authorization": f"Bearer {self.auth_token}",
            "Content-Type": "application/json"
        }
        
        try:
            response = requests.get(
                f"{self.base_url}/adaptive-nudges/fallback",
                headers=headers,
                timeout=10
            )
            
            self.log(f"Adaptive nudge fallback response status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                self.log("✅ Adaptive nudge fallback successful")
                self.log(f"✅ Response: {data.get('status')}")
                return True
            else:
                self.log(f"❌ Adaptive nudge fallback failed: {response.status_code}")
                self.log(f"❌ Response: {response.text}")
                return False
                
        except Exception as e:
            self.log(f"❌ Adaptive nudge fallback error: {str(e)}")
            return False
    
    def test_adaptive_nudge_interaction(self):
        """Priority 2: Test POST /api/adaptive-nudges/{nudge_id}/interaction"""
        self.log("Testing adaptive nudge interaction...")
        
        if not self.auth_token:
            self.log("❌ No auth token for interaction test")
            return False
        
        headers = {
            "Authorization": f"Bearer {self.auth_token}",
            "Content-Type": "application/json"
        }
        
        # Use a test nudge ID
        test_nudge_id = str(uuid.uuid4())
        
        try:
            response = requests.post(
                f"{self.base_url}/adaptive-nudges/{test_nudge_id}/interaction",
                params={"action": "engaged"},
                headers=headers,
                timeout=10
            )
            
            self.log(f"Adaptive nudge interaction response status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                self.log("✅ Adaptive nudge interaction successful")
                self.log(f"✅ Response: {data.get('status')}")
                return True
            else:
                self.log(f"❌ Adaptive nudge interaction failed: {response.status_code}")
                self.log(f"❌ Response: {response.text}")
                return False
                
        except Exception as e:
            self.log(f"❌ Adaptive nudge interaction error: {str(e)}")
            return False
    
    def test_preferences_get(self):
        """Priority 3: Test GET /api/preferences"""
        self.log("Testing preferences GET...")
        
        if not self.auth_token:
            self.log("❌ No auth token for preferences test")
            return False
        
        headers = {
            "Authorization": f"Bearer {self.auth_token}",
            "Content-Type": "application/json"
        }
        
        try:
            response = requests.get(
                f"{self.base_url}/preferences",
                headers=headers,
                timeout=10
            )
            
            self.log(f"Preferences GET response status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                self.log("✅ Preferences GET successful")
                self.log(f"✅ Anchor action: {data.get('anchor_action')}")
                return True
            else:
                self.log(f"❌ Preferences GET failed: {response.status_code}")
                self.log(f"❌ Response: {response.text}")
                return False
                
        except Exception as e:
            self.log(f"❌ Preferences GET error: {str(e)}")
            return False
    
    def test_preferences_patch(self):
        """Priority 3: Test PATCH /api/preferences with anchor_actions"""
        self.log("Testing preferences PATCH with anchor_actions...")
        
        if not self.auth_token:
            self.log("❌ No auth token for preferences patch test")
            return False
        
        headers = {
            "Authorization": f"Bearer {self.auth_token}",
            "Content-Type": "application/json"
        }
        
        # Test updating anchor action
        update_data = {
            "anchor_action": "complete one important task"
        }
        
        try:
            response = requests.patch(
                f"{self.base_url}/preferences",
                json=update_data,
                headers=headers,
                timeout=10
            )
            
            self.log(f"Preferences PATCH response status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                self.log("✅ Preferences PATCH successful")
                self.log(f"✅ Updates: {data.get('updates')}")
                return True
            else:
                self.log(f"❌ Preferences PATCH failed: {response.status_code}")
                self.log(f"❌ Response: {response.text}")
                return False
                
        except Exception as e:
            self.log(f"❌ Preferences PATCH error: {str(e)}")
            return False
    
    def run_all_tests(self):
        """Run all backend tests in priority order"""
        self.log("=" * 60)
        self.log("STARTING COMPREHENSIVE BACKEND TESTING")
        self.log("=" * 60)
        
        results = {}
        
        # Health check first
        results['health'] = self.test_health_check()
        
        # Priority 1: Auth Endpoints (CRITICAL)
        self.log("\n" + "=" * 40)
        self.log("PRIORITY 1: AUTH ENDPOINTS (CRITICAL)")
        self.log("=" * 40)
        
        results['auth_signup'] = self.test_auth_signup()
        results['auth_login'] = self.test_auth_login()
        results['jwt_verification'] = self.test_jwt_verification()
        
        # Priority 2: Adaptive Nudge Engine Endpoints (NEW)
        self.log("\n" + "=" * 40)
        self.log("PRIORITY 2: ADAPTIVE NUDGE ENGINE (NEW)")
        self.log("=" * 40)
        
        results['adaptive_evaluate'] = self.test_adaptive_nudge_evaluate()
        results['adaptive_fallback'] = self.test_adaptive_nudge_fallback()
        results['adaptive_interaction'] = self.test_adaptive_nudge_interaction()
        
        # Priority 3: Preferences API
        self.log("\n" + "=" * 40)
        self.log("PRIORITY 3: PREFERENCES API")
        self.log("=" * 40)
        
        results['preferences_get'] = self.test_preferences_get()
        results['preferences_patch'] = self.test_preferences_patch()
        
        # Summary
        self.log("\n" + "=" * 60)
        self.log("TEST RESULTS SUMMARY")
        self.log("=" * 60)
        
        auth_working = all([results['auth_signup'], results['auth_login'], results['jwt_verification']])
        adaptive_working = all([results['adaptive_evaluate'], results['adaptive_fallback'], results['adaptive_interaction']])
        preferences_working = all([results['preferences_get'], results['preferences_patch']])
        
        self.log(f"1. Auth working? {'✅' if auth_working else '❌'}")
        self.log(f"2. Adaptive nudge endpoints working? {'✅' if adaptive_working else '❌'}")
        self.log(f"3. Preferences API working? {'✅' if preferences_working else '❌'}")
        
        # Check for 400/401 errors
        errors_found = []
        for test_name, result in results.items():
            if not result:
                errors_found.append(test_name)
        
        if errors_found:
            self.log(f"4. Errors found in: {', '.join(errors_found)}")
        else:
            self.log("4. No 400/401 errors found ✅")
        
        return {
            'auth_working': auth_working,
            'adaptive_working': adaptive_working,
            'preferences_working': preferences_working,
            'errors': errors_found,
            'detailed_results': results
        }

if __name__ == "__main__":
    tester = BackendTester()
    results = tester.run_all_tests()