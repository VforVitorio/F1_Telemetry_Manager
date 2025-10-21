import unittest
from datetime import timedelta
from core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    decode_access_token
)


class TestSecurity(unittest.TestCase):
    """Test security module functions"""

    def test_password_hashing(self):
        """Test password hash and verification"""
        password = "test_password_123"
        hashed = get_password_hash(password)

        # Hash should not equal plain password
        self.assertNotEqual(password, hashed)

        # Verification should work
        self.assertTrue(verify_password(password, hashed))

        # Wrong password should fail
        self.assertFalse(verify_password("wrong_password", hashed))

    def test_token_creation_and_decode(self):
        """Test JWT token creation and decoding"""
        data = {"sub": "test_user", "role": "user"}
        token = create_access_token(data)

        # Token should be created
        self.assertIsNotNone(token)
        self.assertIsInstance(token, str)

        # Decode should return original data
        decoded = decode_access_token(token)
        self.assertEqual(decoded["sub"], "test_user")
        self.assertEqual(decoded["role"], "user")
        self.assertIn("exp", decoded)

    def test_token_with_custom_expiry(self):
        """Test token with custom expiration"""
        data = {"sub": "test_user"}
        token = create_access_token(data, expires_delta=timedelta(minutes=5))

        decoded = decode_access_token(token)
        self.assertIsNotNone(decoded)
        self.assertEqual(decoded["sub"], "test_user")

    def test_invalid_token(self):
        """Test decoding invalid token"""
        invalid_token = "invalid.token.string"
        decoded = decode_access_token(invalid_token)

        self.assertIsNone(decoded)

    def test_expired_token(self):
        """Test decoding expired token"""
        data = {"sub": "test_user"}
        # Create token that expires immediately
        token = create_access_token(data, expires_delta=timedelta(seconds=-1))

        decoded = decode_access_token(token)
        self.assertIsNone(decoded)


if __name__ == "__main__":
    unittest.main()
