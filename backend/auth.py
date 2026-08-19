import hashlib
import os
import time
import jwt
from typing import Optional

SECRET_KEY = os.environ.get("PROJYN_SECRET_KEY", "projyn-super-secret-playout-key-928374827")
ALGORITHM = "HS256"
TOKEN_EXPIRE_SECONDS = 24 * 60 * 60 # 24 horas

def hash_password(password: str) -> str:
  """Gera um hash PBKDF2 seguro para a senha informada."""
  salt = os.urandom(16).hex()
  pwd_bytes = password.encode('utf-8')
  salt_bytes = salt.encode('utf-8')
  h = hashlib.pbkdf2_hmac('sha256', pwd_bytes, salt_bytes, 100000)
  return f"{salt}${h.hex()}"

def verify_password(password: str, hashed: str) -> bool:
  """Verifica se a senha corresponde ao hash fornecido."""
  try:
    if not hashed or "$" not in hashed:
      return False
    salt, stored_hash = hashed.split('$', 1)
    pwd_bytes = password.encode('utf-8')
    salt_bytes = salt.encode('utf-8')
    h = hashlib.pbkdf2_hmac('sha256', pwd_bytes, salt_bytes, 100000)
    return h.hex() == stored_hash
  except Exception:
    return False

def create_jwt_token(data: dict) -> str:
  """Cria um token JWT com expiração de 24 horas."""
  to_encode = data.copy()
  expire = time.time() + TOKEN_EXPIRE_SECONDS
  to_encode.update({"exp": expire})
  return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_jwt_token(token: str) -> Optional[dict]:
  """Decodifica e valida o token JWT."""
  try:
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    if payload.get("exp", 0) < time.time():
      return None
    return payload
  except jwt.PyJWTError:
    return None
