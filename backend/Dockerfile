FROM python:3.12-slim
ARG WITH_ML=0
WORKDIR /srv/backend
COPY backend/requirements.txt backend/requirements-ml.txt ./
RUN pip install --no-cache-dir -r requirements.txt
RUN if [ "$WITH_ML" = "1" ]; then \
      pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu && \
      pip install --no-cache-dir -r requirements-ml.txt; \
    fi
COPY backend/app ./app
COPY backend/datasets ./datasets
COPY ml /srv/ml
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
