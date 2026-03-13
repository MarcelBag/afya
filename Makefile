SHELL := /bin/bash

# Determine which compose files to use
COMPOSE_FILES := -f docker/compose.yml

DC := docker compose $(COMPOSE_FILES)

.PHONY: dev build up down logs restart shell-backend shell-gateway ps pull prod stop

# ----------------------------
# Environments
# ----------------------------
dev: build up

build:
	$(DC) build

up:
	$(DC) up -d

down:
	$(DC) down

restart:
	$(DC) restart

logs:
	$(DC) logs -f

ps:
	$(DC) ps

pull:
	git pull origin main

prod:
	# Ensure production environment variables are used
	$(DC) build
	$(DC) up -d

stop: down

# ----------------------------
# Interactive Shells
# ----------------------------
shell-backend:
	$(DC) exec flask-backend /bin/bash

shell-gateway:
	$(DC) exec express-gateway /bin/bash

# ----------------------------
# Cleanup
# ----------------------------
clean:
	$(DC) down --rmi all --volumes --remove-orphans
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
