"""
Utility script to generate a secure SECRET_KEY for JWT authentication.

Run this script once during initial setup to generate a secure random key.
Copy the output to your .env file as SECRET_KEY value.

Usage:
    python backend/utils/generate_secret.py
"""

import secrets


def generate_secret_key(length: int = 32) -> str:
    """
    Generate a cryptographically secure random secret key.

    Args:
        length: Length in bytes (default 32 = 256 bits)

    Returns:
        Hexadecimal string representation of random bytes
    """
    return secrets.token_hex(length)


if __name__ == "__main__":
    print("\n" + "="*60)
    print("🔐 JWT SECRET_KEY GENERATOR")
    print("="*60 + "\n")

    secret_key = generate_secret_key()

    print(f"Generated SECRET_KEY:\n{secret_key}\n")
    print("Copy this to your .env file:")
    print(f"SECRET_KEY={secret_key}\n")
    print("⚠️  IMPORTANT: Keep this key secret and never commit it to Git!")
    print("="*60 + "\n")
