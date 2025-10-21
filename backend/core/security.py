from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client, Client
from functools import lru_cache
from . import config

security = HTTPBearer()

@lru_cache()
def get_supabase_client() -> Client:
    return create_client(config.SUPABASE_URL, config.SUPABASE_KEY)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        supabase = get_supabase_client()
        user = supabase.auth.get_user(credentials.credentials)
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
        return user
    except:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")