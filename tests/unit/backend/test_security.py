import pytest
from unittest.mock import Mock, patch
from fastapi import HTTPException
from backend.core.security import get_supabase_client, get_current_user
from fastapi.security import HTTPAuthorizationCredentials

def test_get_supabase_client_singleton():
    """Verifica que el cliente sea singleton"""
    client1 = get_supabase_client()
    client2 = get_supabase_client()
    assert client1 is client2

@pytest.mark.asyncio
async def test_get_current_user_valid_token():
    """Test con token válido"""
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
    """Test con token inválido"""
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
    """Test cuando no retorna usuario"""
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