"""
IUIU Smart Parking — Django Settings
Copy this to your project and fill in the env-specific values.
"""
import os
import dj_database_url
from pathlib import Path
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'change-me-in-production')
DEBUG      = os.environ.get('DEBUG', 'True') == 'True'

# Include local-network IPs so ESP32 devices can reach the server.
# In production set ALLOWED_HOSTS env var explicitly.
_default_hosts = 'localhost,127.0.0.1,0.0.0.0'
ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', _default_hosts).split(',')
# Railway injects RAILWAY_PUBLIC_DOMAIN — add it automatically
# Render injects RENDER_EXTERNAL_HOSTNAME; Railway injects RAILWAY_PUBLIC_DOMAIN
for _host_var in ('RENDER_EXTERNAL_HOSTNAME', 'RAILWAY_PUBLIC_DOMAIN'):
    _h = os.environ.get(_host_var)
    if _h:
        ALLOWED_HOSTS.append(_h)
# Allow all hosts in DEBUG mode (local LAN deployments with dynamic IPs)
if DEBUG:
    ALLOWED_HOSTS = ['*']

# ── Applications ─────────────────────────────────────────────────────────────

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third-party
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    'channels',
    'django_filters',
    # Local
    'parking',
    'device_control',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF  = 'iuiu_parking.urls'
WSGI_APPLICATION = 'iuiu_parking.wsgi.application'
ASGI_APPLICATION = 'iuiu_parking.asgi.application'

# ── Database ──────────────────────────────────────────────────────────────────

# Railway provides DATABASE_URL; fall back to individual vars or SQLite for local dev.
_database_url = os.environ.get('DATABASE_URL')
if _database_url:
    DATABASES = {'default': dj_database_url.parse(_database_url, conn_max_age=600)}
elif os.environ.get('USE_SQLITE', 'False') == 'True':
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME':   os.environ.get('DB_NAME',     'iuiu_parking'),
            'USER':   os.environ.get('DB_USER',     'postgres'),
            'PASSWORD': os.environ.get('DB_PASSWORD', ''),
            'HOST':   os.environ.get('DB_HOST',     'localhost'),
            'PORT':   os.environ.get('DB_PORT',     '5432'),
        }
    }

# ── Auth ──────────────────────────────────────────────────────────────────────

AUTH_USER_MODEL = 'parking.User'

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME':  timedelta(hours=12),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ALGORITHM': 'HS256',
}

# ── REST Framework ────────────────────────────────────────────────────────────

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 50,
}

# ── CORS ──────────────────────────────────────────────────────────────────────

CORS_ALLOWED_ORIGINS = os.environ.get(
    'CORS_ORIGINS',
    'http://localhost:3000,http://localhost:5173'
).split(',')
CORS_ALLOW_CREDENTIALS = True
# In production, also allow any *.vercel.app origin automatically
CORS_ALLOWED_ORIGIN_REGEXES = [r'^https://.*\.vercel\.app$'] if not DEBUG else []

# ── Channels (WebSocket) ──────────────────────────────────────────────────────

# For local/offline operation the in-memory layer works without Redis.
# Set USE_REDIS_CHANNELS=True in .env when Redis is available (multi-process).
if os.environ.get('USE_REDIS_CHANNELS', 'False') == 'True':
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels_redis.core.RedisChannelLayer',
            'CONFIG': {
                'hosts': [(os.environ.get('REDIS_HOST', '127.0.0.1'), 6379)],
            },
        },
    }
else:
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels.layers.InMemoryChannelLayer',
        }
    }

# ── Local-network / offline configuration ────────────────────────────────────
# Firebase is NOT used. All IoT commands go directly to ESP32 via HTTP polling.

# CORS: allow the local Vite dev server and any LAN origin during development
CORS_ALLOW_ALL_ORIGINS = DEBUG  # allows all origins in local dev mode

# ── Static / Media ────────────────────────────────────────────────────────────

STATIC_URL  = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

MEDIA_URL  = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

TEMPLATES = [{
    'BACKEND': 'django.template.backends.django.DjangoTemplates',
    'DIRS': [],
    'APP_DIRS': True,
    'OPTIONS': {'context_processors': [
        'django.template.context_processors.debug',
        'django.template.context_processors.request',
        'django.contrib.auth.context_processors.auth',
        'django.contrib.messages.context_processors.messages',
    ]},
}]
