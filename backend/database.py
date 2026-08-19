import json
from sqlalchemy import create_engine, Column, Integer, String, Boolean, Float, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

DATABASE_URL = "sqlite:///./database.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class DBUser(Base):
  __tablename__ = "users"
  
  id = Column(Integer, primary_key=True, index=True)
  username = Column(String, unique=True, index=True, nullable=False)
  password_hash = Column(String, nullable=False)
  is_admin = Column(Boolean, default=False)
  can_create_category = Column(Boolean, default=False)
  can_add_songs = Column(Boolean, default=False)
  can_play_control = Column(Boolean, default=False)
  see_all_categories = Column(Boolean, default=True)
  allowed_categories_json = Column(String, default="[]") # Armazena como string JSON ["cat1", "cat2"]

  @property
  def allowed_categories(self):
    try:
      return json.loads(self.allowed_categories_json or "[]")
    except Exception:
      return []

  @allowed_categories.setter
  def allowed_categories(self, value):
    self.allowed_categories_json = json.dumps(value or [])

class DBCategory(Base):
  __tablename__ = "categories"
  
  id = Column(String, primary_key=True, index=True) # Slugified title or uuid
  title = Column(String, nullable=False)
  color = Column(String, default="#e73c55")
  created_at = Column(Float, nullable=False)
  updated_at = Column(Float, nullable=False)
  
  videos = relationship("DBVideo", back_populates="category", cascade="all, delete-orphan")

class DBVideo(Base):
  __tablename__ = "videos"
  
  id = Column(String, primary_key=True, index=True) # YouTube Video ID (11 chars)
  title = Column(String, nullable=False)
  channel = Column(String, default="")
  duration = Column(String, default="0") # Pode ser segundos (float/int) ou string formatada
  thumbnail = Column(String, default="")
  url = Column(String, nullable=False)
  stream_url = Column(String, default="")
  stream_ext = Column(String, default="")
  stream_protocol = Column(String, default="")
  stream_height = Column(Integer, default=0)
  stream_format_id = Column(String, default="")
  stream_quality = Column(String, default="")
  prepared_at = Column(Float, default=0.0)
  saved_at = Column(Float, default=0.0)
  category_id = Column(String, ForeignKey("categories.id", ondelete="CASCADE"), nullable=False)
  
  category = relationship("DBCategory", back_populates="videos")

class DBSetting(Base):
  __tablename__ = "settings"
  
  key = Column(String, primary_key=True, index=True)
  value_json = Column(String, nullable=False)

  @property
  def value(self):
    try:
      return json.loads(self.value_json or "{}")
    except Exception:
      return {}

  @value.setter
  def value(self, val):
    self.value_json = json.dumps(val or {})

class DBPreset(Base):
  __tablename__ = "presets"
  
  id = Column(String, primary_key=True, index=True)
  name = Column(String, nullable=False)
  display_settings_json = Column(String, nullable=False) # JSON display
  player_settings_json = Column(String, nullable=False) # JSON player

  @property
  def display(self):
    try:
      return json.loads(self.display_settings_json or "{}")
    except Exception:
      return {}

  @display.setter
  def display(self, val):
    self.display_settings_json = json.dumps(val or {})

  @property
  def player(self):
    try:
      return json.loads(self.player_settings_json or "{}")
    except Exception:
      return {}

  @player.setter
  def player(self, val):
    self.player_settings_json = json.dumps(val or {})

def init_db():
  Base.metadata.create_all(bind=engine)

def get_db():
  db = SessionLocal()
  try:
    yield db
  finally:
    db.close()
