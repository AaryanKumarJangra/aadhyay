#!/bin/sh
# Nightly logical backup → object storage (R2 / E2E Object Storage). Keep 30 days. RPO for Stage A+: add WAL-G (see runbook).
set -e
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
FILE=/tmp/aadhyay-$STAMP.dump
PGPASSWORD="$PG_ADMIN_PASSWORD" pg_dump -h "${PGHOST:-postgres}" -U aadhyay_admin -d aadhyay -Fc -f "$FILE"
AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" aws --endpoint-url "$S3_ENDPOINT" s3 cp "$FILE" "s3://$S3_BACKUP_BUCKET/db/$STAMP.dump"
rm -f "$FILE"
echo "backup $STAMP ok"
