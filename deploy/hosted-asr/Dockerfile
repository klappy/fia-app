# Build context is emitted by prepare-build.mjs after input byte verification.
FROM docker.io/library/python@sha256:9901e0a8d75037d8242ed43155cbcb2d1f61be1356383d8054afb59fd50e39c4
ENV HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 HF_HUB_DISABLE_TELEMETRY=1 PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 HOME=/scratch TMPDIR=/scratch
COPY wheels /wheels
COPY requirements.lock /requirements.lock
RUN python -m pip install --no-index --find-links=/wheels --require-hashes --no-cache-dir -r /requirements.lock && rm -rf /wheels
COPY model /opt/model
COPY notices /opt/notices
COPY proposal.json transcribe-defaults.json recognize.py /opt/fia/
RUN chmod -R a-w /opt/model /opt/fia && mkdir /scratch && chmod 1777 /scratch
USER 65532:65532
WORKDIR /scratch
ENTRYPOINT ["python", "/opt/fia/recognize.py"]
