SHELL := /bin/bash
.DEFAULT_GOAL := help

COMPOSE_FILE := docker/compose.yml

DEV_COMPOSE := docker compose --profile legacy --env-file .env -f $(COMPOSE_FILE)
PROD_COMPOSE := ENV_FILE=$(CURDIR)/.env.prod docker compose --profile legacy --env-file .env.prod -f $(COMPOSE_FILE)
LOGS_COMPOSE := $(if $(wildcard .env),$(DEV_COMPOSE),$(if $(wildcard .env.prod),$(PROD_COMPOSE),$(DEV_COMPOSE)))

DJANGO_PROJECT_NAME := afya-django
DJANGO_DEV_COMPOSE := FLASK_PORT=5003 docker compose -p $(DJANGO_PROJECT_NAME) --profile django --env-file .env -f $(COMPOSE_FILE)
DJANGO_PROD_COMPOSE := ENV_FILE=$(CURDIR)/.env.prod FLASK_PORT=5003 docker compose -p $(DJANGO_PROJECT_NAME) --profile django --env-file .env.prod -f $(COMPOSE_FILE)

.PHONY: help \
	dev dev-reset build up down restart stop logs dev-logs prod prod-logs prod-down ps pull \
	shell-backend shell-gateway shell-django \
	django-build django-up django-down django-logs django-reset-db django-prod django-prod-build django-prod-up django-prod-down django-prod-logs django-prod-migrate django-prod-collectstatic django-prod-check django-makemigrations django-migrate django-createsuperuser django-shell django-check django-test \
	makemigrations migrate createsuperuser shell test check \
	clean clean-cache

# ----------------------------
# Current Stack
# ----------------------------
dev:
	$(DEV_COMPOSE) up -d --build

dev-reset:
	$(DEV_COMPOSE) down
	$(DEV_COMPOSE) up -d --build

build:
	$(DEV_COMPOSE) build

up:
	$(DEV_COMPOSE) up -d

down:
	$(DEV_COMPOSE) down

restart:
	$(DEV_COMPOSE) restart

stop: down

logs:
	$(LOGS_COMPOSE) logs -f

dev-logs:
	$(DEV_COMPOSE) logs -f

ps:
	$(DEV_COMPOSE) ps

pull:
	git pull origin main

# ----------------------------
# Production Current Stack
# ----------------------------
prod:
	$(PROD_COMPOSE) up -d --build

prod-logs:
	$(PROD_COMPOSE) logs -f

prod-down:
	$(PROD_COMPOSE) down

# ----------------------------
# Interactive Shells
# ----------------------------
shell-backend:
	$(DEV_COMPOSE) exec flask-backend /bin/bash

shell-gateway:
	$(DEV_COMPOSE) exec express-gateway /bin/bash

shell-django:
	$(DJANGO_DEV_COMPOSE) exec django-app /bin/bash

# ----------------------------
# Django Migration Stack
# ----------------------------
django-build:
	$(DJANGO_DEV_COMPOSE) build django-app

django-up:
	$(DJANGO_DEV_COMPOSE) up -d flask-backend postgres django-app

django-down:
	$(DJANGO_DEV_COMPOSE) stop django-app postgres flask-backend

django-logs:
	$(DJANGO_DEV_COMPOSE) logs -f django-app postgres flask-backend

django-reset-db:
	$(DJANGO_DEV_COMPOSE) down -v
	$(DJANGO_DEV_COMPOSE) up -d flask-backend postgres django-app

django-makemigrations:
	$(DJANGO_DEV_COMPOSE) exec django-app python manage.py makemigrations

django-migrate:
	$(DJANGO_DEV_COMPOSE) exec django-app python manage.py migrate

django-createsuperuser:
	$(DJANGO_DEV_COMPOSE) exec django-app python manage.py createsuperuser

django-shell:
	$(DJANGO_DEV_COMPOSE) exec django-app python manage.py shell

django-check:
	$(DJANGO_DEV_COMPOSE) exec django-app python manage.py check

django-test:
	$(DJANGO_DEV_COMPOSE) exec django-app python manage.py test

# ----------------------------
# Django Production Stack
# ----------------------------
django-prod: django-prod-build django-prod-up django-prod-migrate django-prod-collectstatic django-prod-check

django-prod-build:
	$(DJANGO_PROD_COMPOSE) build django-app flask-backend

django-prod-up:
	$(DJANGO_PROD_COMPOSE) up -d postgres flask-backend django-app

django-prod-down:
	$(DJANGO_PROD_COMPOSE) down

django-prod-logs:
	$(DJANGO_PROD_COMPOSE) logs -f django-app postgres flask-backend

django-prod-migrate:
	$(DJANGO_PROD_COMPOSE) exec django-app python manage.py migrate --noinput

django-prod-collectstatic:
	$(DJANGO_PROD_COMPOSE) exec django-app python manage.py collectstatic --noinput

django-prod-check:
	$(DJANGO_PROD_COMPOSE) exec django-app python manage.py check --deploy

# Articles-style aliases for the Django migration stack.
makemigrations: django-makemigrations
migrate: django-migrate
createsuperuser: django-createsuperuser
shell: django-shell
test: django-test

# ----------------------------
# Checks
# ----------------------------
check:
	node --check backend/server.js
	node --check frontend/js/admin.js
	python backend/manage.py check

# ----------------------------
# Cleanup
# ----------------------------
clean:
	$(DEV_COMPOSE) down --rmi all --volumes --remove-orphans
	$(DJANGO_DEV_COMPOSE) down --rmi all --volumes --remove-orphans
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete

clean-cache:
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete

# ============================
# Help
# ============================
help:
	@echo "╔════════════════════════════════════════════════════════════════╗"
	@echo "║              Afya Platform - Make Command Reference           ║"
	@echo "╚════════════════════════════════════════════════════════════════╝"
	@echo ""
	@echo "🚀 ENVIRONMENTS"
	@echo "  make dev              - Start current dev stack: Express + Flask + Mongo"
	@echo "  make prod             - Start current production stack with .env.prod"
	@echo "  make django-prod      - Build/start Django production stack and run migrations/static/checks"
	@echo "  make dev-reset        - Hard reset current dev stack and rebuild images"
	@echo ""
	@echo "🐳 CURRENT STACK CONTAINERS"
	@echo "  make build            - Build current stack images"
	@echo "  make up               - Start current stack containers"
	@echo "  make down             - Stop and remove current stack containers"
	@echo "  make restart          - Restart current stack containers"
	@echo "  make ps               - Show current stack container status"
	@echo "  make logs             - View available stack logs (auto-select env)"
	@echo "  make dev-logs         - View current dev stack logs"
	@echo "  make prod-logs        - View current production stack logs"
	@echo "  make shell-backend    - Open shell in Flask ML container"
	@echo "  make shell-gateway    - Open shell in Express gateway container"
	@echo ""
	@echo "🧭 DJANGO MIGRATION STACK"
	@echo "  make django-build     - Build opt-in Django image"
	@echo "  make django-up        - Start Django + Postgres sidecar services"
	@echo "  make django-down      - Stop Django + Postgres sidecar services"
	@echo "  make django-logs      - View Django + Postgres logs"
	@echo "  make django-prod-logs - View Django production stack logs"
	@echo "  make django-reset-db  - Reset only Django sidecar DB volume"
	@echo "  make shell-django     - Open bash shell in Django container"
	@echo ""
	@echo "🗄️  DJANGO DATABASE & MANAGEMENT"
	@echo "  make migrate          - Apply Django migrations (alias)"
	@echo "  make makemigrations   - Create Django migrations (alias)"
	@echo "  make createsuperuser  - Create Django superuser (alias)"
	@echo "  make shell            - Open Django shell (alias)"
	@echo "  make test             - Run Django tests (alias)"
	@echo "  make django-check     - Run Django system checks in container"
	@echo ""
	@echo "🛠️  MAINTENANCE"
	@echo "  make check            - Run local Node syntax + Django checks"
	@echo "  make pull             - Pull latest main branch"
	@echo "  make clean            - Remove containers, images, volumes, pycache"
	@echo "  make clean-cache      - Remove Python cache files only"
	@echo ""
	@echo "📝 SAFE DJANGO MIGRATION START"
	@echo "  make check"
	@echo "  make django-build"
	@echo "  make django-up"
	@echo "  make migrate"
	@echo "  make createsuperuser"
	@echo ""
