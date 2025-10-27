# frontend/app/services/auth_service.py
import requests
from config import BACKEND_URL


class AuthService:

    @staticmethod
    def login(email: str, password: str):
        """
        Calls backend login endpoint
        Returns: (success: bool, data: dict, error: str)
        """
        try:
            response = requests.post(
                f"{BACKEND_URL}/api/v1/auth/signin",
                json={"email": email, "password": password}
            )

            if response.status_code == 200:
                return True, response.json(), None
            else:
                return False, None, "Invalid credentials"

        except Exception as e:
            return False, None, f"Connection error: {str(e)}"

    @staticmethod
    def register(email: str, password: str, full_name: str):
        """
        Calls backend register endpoint
        Returns: (success: bool, message: str, error: str)
        """
        try:
            response = requests.post(
                f"{BACKEND_URL}/api/v1/auth/signup",
                json={
                    "email": email,
                    "password": password,
                    "full_name": full_name
                }
            )

            if response.status_code == 200:
                return True, "Account created successfully", None
            else:
                error = response.json().get("detail", "Registration failed")
                return False, None, error

        except Exception as e:
            return False, None, f"Connection error: {str(e)}"
