#!/bin/sh
# Restore drill / provider migration: ./restore.sh s3://bucket/db/<stamp>.dump
set -e
AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" aws --endpoint-url "$S3_ENDPOINT" s3 cp "$1" /tmp/restore.dump
PGPASSWORD="$PG_ADMIN_PASSWORD" pg_restore -h "${PGHOST:-postgres}" -U aadhyay_admin -d aadhyay --clean --if-exists /tmp/restore.dump
echo "restored $1"
