import pytest
from fastapi.testclient import TestClient
from unittest.mock import Mock
from backend.main import app
from backend.core.security import get_supabase_client, get_current_user
import uuid

pytestmark = pytest.mark.unit

client = TestClient(app)
TEST_USER_ID = str(uuid.uuid4())

@pytest.fixture(autouse=True)
def reset_dependency_overrides():
    """Limpia los overrides después de cada test"""
    yield
    app.dependency_overrides = {}

@pytest.fixture
def mock_supabase_signup():
    supabase_mock = Mock()
    user_mock = Mock()
    user_mock.id = TEST_USER_ID
    user_mock.email = "test@example.com"
    
    supabase_mock.auth.sign_up.return_value = Mock(
        user=user_mock,
        session=Mock()
    )
    
    app.dependency_overrides[get_supabase_client] = lambda: supabase_mock
    return supabase_mock

@pytest.fixture
def mock_supabase_signin():
    supabase_mock = Mock()
    user_mock = Mock()
    user_mock.id = TEST_USER_ID
    user_mock.email = "test@example.com"
    
    session_mock = Mock()
    session_mock.access_token = "test-token-123"
    
    supabase_mock.auth.sign_in_with_password.return_value = Mock(
        user=user_mock,
        session=session_mock
    )
    
    app.dependency_overrides[get_supabase_client] = lambda: supabase_mock
    return supabase_mock

@pytest.fixture
def mock_supabase_get_user():
    supabase_mock = Mock()
    user_mock = Mock()
    user_mock.user.id = TEST_USER_ID
    user_mock.user.email = "test@example.com"
    
    supabase_mock.auth.get_user.return_value = user_mock
    
    # Mock table operations
    execute_mock = Mock()
    execute_mock.data = [{
        "id": TEST_USER_ID,
        "email": "test@example.com",
        "full_name": "Test User",
        "created_at": "2025-01-01T00:00:00"
    }]
    
    supabase_mock.table.return_value.select.return_value.eq.return_value.execute.return_value = execute_mock
    
    app.dependency_overrides[get_supabase_client] = lambda: supabase_mock
    return supabase_mock

@pytest.fixture
def mock_current_user():
    user_mock = Mock()
    user_mock.user.id = TEST_USER_ID
    user_mock.user.email = "test@example.com"
    
    app.dependency_overrides[get_current_user] = lambda: user_mock
    return user_mock

# Tests de Signup
def test_signup_success(mock_supabase_signup):
    response = client.post(
        "/api/v1/auth/signup",
        json={
            "email": "test@example.com",
            "password": "password123",
            "full_name": "Test User"
        }
    )
    assert response.status_code == 200
    assert "message" in response.json()
    assert "user_id" in response.json()

def test_signup_invalid_email():
    response = client.post(
        "/api/v1/auth/signup",
        json={
            "email": "invalid-email",
            "password": "password123"
        }
    )
    assert response.status_code == 422

def test_signup_missing_password():
    response = client.post(
        "/api/v1/auth/signup",
        json={
            "email": "test@example.com"
        }
    )
    assert response.status_code == 422

def test_signup_supabase_error():
    supabase_mock = Mock()
    supabase_mock.auth.sign_up.side_effect = Exception("User already exists")
    app.dependency_overrides[get_supabase_client] = lambda: supabase_mock
    
    response = client.post(
        "/api/v1/auth/signup",
        json={
            "email": "test@example.com",
            "password": "password123"
        }
    )
    assert response.status_code == 400

# Tests de Signin
def test_signin_success(mock_supabase_signin):
    response = client.post(
        "/api/v1/auth/signin",
        json={
            "email": "test@example.com",
            "password": "password123"
        }
    )
    assert response.status_code == 200
    assert "access_token" in response.json()
    assert response.json()["token_type"] == "bearer"

def test_signin_invalid_credentials():
    supabase_mock = Mock()
    supabase_mock.auth.sign_in_with_password.side_effect = Exception("Invalid credentials")
    app.dependency_overrides[get_supabase_client] = lambda: supabase_mock
    
    response = client.post(
        "/api/v1/auth/signin",
        json={
            "email": "test@example.com",
            "password": "wrongpassword"
        }
    )
    assert response.status_code == 401

def test_signin_missing_email():
    response = client.post(
        "/api/v1/auth/signin",
        json={
            "password": "password123"
        }
    )
    assert response.status_code == 422

# Tests de Get Profile
def test_get_profile_success(mock_supabase_get_user, mock_current_user):
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer test-token-123"}
    )
    assert response.status_code == 200
    assert response.json()["email"] == "test@example.com"
    assert response.json()["id"] == TEST_USER_ID

def test_get_profile_no_token():
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 403

def test_get_profile_invalid_token():
    supabase_mock = Mock()
    supabase_mock.auth.get_user.side_effect = Exception("Invalid token")
    app.dependency_overrides[get_supabase_client] = lambda: supabase_mock
    
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer invalid-token"}
    )
    assert response.status_code == 401

def test_get_profile_not_found(mock_current_user):
    supabase_mock = Mock()
    execute_mock = Mock()
    execute_mock.data = []
    supabase_mock.table.return_value.select.return_value.eq.return_value.execute.return_value = execute_mock
    
    app.dependency_overrides[get_supabase_client] = lambda: supabase_mock
    
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer test-token-123"}
    )
    assert response.status_code == 404

# Tests de Signout
def test_signout_success(mock_current_user):
    supabase_mock = Mock()
    supabase_mock.auth.sign_out.return_value = None
    
    app.dependency_overrides[get_supabase_client] = lambda: supabase_mock
    
    response = client.post(
        "/api/v1/auth/signout",
        headers={"Authorization": "Bearer test-token-123"}
    )
    assert response.status_code == 200
    assert response.json()["message"] == "Sesión cerrada"

def test_signout_no_token():
    response = client.post("/api/v1/auth/signout")
    assert response.status_code == 403