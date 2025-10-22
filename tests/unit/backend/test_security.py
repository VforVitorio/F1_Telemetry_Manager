import pytest
from unittest.mock import Mock, patch
from fastapi import HTTPException
from backend.core.security import get_supabase_client, get_current_user
from fastapi.security import HTTPAuthorizationCredentials


@patch('backend.core.security.create_client')
def test_get_supabase_client_singleton(mock_create_client):
    """Verifies that the client is singleton"""
    mock_client = Mock()
    mock_create_client.return_value = mock_client

    # Reset the singleton before test
    if hasattr(get_supabase_client, '_client'):
        delattr(get_supabase_client, '_client')

    client1 = get_supabase_client()
    client2 = get_supabase_client()

    assert client1 is client2
    assert mock_create_client.call_count == 1


@pytest.mark.asyncio
async def test_get_current_user_valid_token():
    """Test with valid token"""
    with patch('backend.core.security.get_supabase_client') as mock:
        supabase_mock = Mock()
        user_mock = Mock()
        user_mock.user.id = "test-id"
        user_mock.user.email = "test@example.com"

        supabase_mock.auth.get_user.return_value = user_mock
        mock.return_value = supabase_mock

        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer",
            credentials="valid-token"
        )

        result = await get_current_user(credentials)
        assert result == user_mock


@pytest.mark.asyncio
async def test_get_current_user_invalid_token():
    """Test with invalid token"""
    with patch('backend.core.security.get_supabase_client') as mock:
        supabase_mock = Mock()
        supabase_mock.auth.get_user.side_effect = Exception("Invalid token")
        mock.return_value = supabase_mock

        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer",
            credentials="invalid-token"
        )

        with pytest.raises(HTTPException) as exc:
            await get_current_user(credentials)

        assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user_no_user():
    """Test when no user is returned"""
    with patch('backend.core.security.get_supabase_client') as mock:
        supabase_mock = Mock()
        supabase_mock.auth.get_user.return_value = None
        mock.return_value = supabase_mock

        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer",
            credentials="token"
        )

        with pytest.raises(HTTPException) as exc:
            await get_current_user(credentials)

        assert exc.value.status_code == 401
