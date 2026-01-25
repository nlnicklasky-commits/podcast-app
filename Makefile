.PHONY: setup dev dev-backend dev-frontend test clean install-backend install-frontend init-db

# Setup development environment
setup: install-backend install-frontend init-db
	@echo "Setup complete! Run 'make dev' to start development servers."

install-backend:
	cd backend && python -m venv venv && . venv/bin/activate && pip install -r requirements.txt

install-frontend:
	cd frontend && npm install

init-db:
	cp -n backend/.env.example backend/.env || true
	cd backend && . venv/bin/activate && python ../scripts/init_db.py

# Run development servers
dev:
	@echo "Starting backend and frontend..."
	@make -j2 dev-backend dev-frontend

dev-backend:
	cd backend && . venv/bin/activate && uvicorn app.main:app --reload --port 8000

dev-frontend:
	cd frontend && npm run dev

# Run backend only
backend:
	cd backend && . venv/bin/activate && uvicorn app.main:app --reload --port 8000

# Run frontend only
frontend:
	cd frontend && npm run dev

# Run tests
test:
	cd backend && . venv/bin/activate && pytest -v

# Lint
lint:
	cd backend && . venv/bin/activate && ruff check .

# Clean data (careful!)
clean-data:
	rm -rf data/audio/* data/chroma/* data/podcasts.db
	@echo "Data cleaned. Run 'make init-db' to reinitialize database."

# Full clean
clean:
	rm -rf backend/venv frontend/node_modules
	rm -rf data/audio/* data/chroma/* data/podcasts.db
	@echo "Full clean complete. Run 'make setup' to reinstall."

# Help
help:
	@echo "Available commands:"
	@echo "  make setup          - Set up development environment"
	@echo "  make dev            - Run both backend and frontend"
	@echo "  make dev-backend    - Run backend only"
	@echo "  make dev-frontend   - Run frontend only"
	@echo "  make test           - Run tests"
	@echo "  make lint           - Run linter"
	@echo "  make clean-data     - Clean data files"
	@echo "  make clean          - Full clean (venv, node_modules, data)"
