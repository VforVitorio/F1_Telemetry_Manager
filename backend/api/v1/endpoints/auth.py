from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, EmailStr
from backend.core.security import get_supabase_client, get_current_user
from supabase import Client

router = APIRouter(prefix="/auth", tags=["auth"])

class SignUpRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str = None

class SignInRequest(BaseModel):
    email: EmailStr
    password: str

@router.post("/signup")
async def signup(req: SignUpRequest, supabase: Client = Depends(get_supabase_client)):
    try:
        response = supabase.auth.sign_up({
            "email": req.email,
            "password": req.password,
            "options": {"data": {"full_name": req.full_name}}
        })
        return {"message": "Usuario creado", "user_id": str(response.user.id)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/signin")
async def signin(req: SignInRequest, supabase: Client = Depends(get_supabase_client)):
    try:
        response = supabase.auth.sign_in_with_password({
            "email": req.email,
            "password": req.password
        })
        return {
            "access_token": response.session.access_token,
            "token_type": "bearer"
        }
    except Exception as e:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

@router.get("/me")
async def get_profile(
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    response = supabase.table('profiles').select("*").eq('id', current_user.user.id).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")
    return response.data[0]

@router.post("/signout")
async def signout(
    current_user=Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    supabase.auth.sign_out()
    return {"message": "Sesión cerrada"}