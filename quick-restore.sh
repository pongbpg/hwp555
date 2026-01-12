#!/bin/bash

MONGODB_URI="mongodb://mongo:KTlBvUhGjEidMDEKLAzevAVCOATaiNsU@gondola.proxy.rlwy.net:33948/"

echo "🔄 กำลัง restore database..."
mongorestore --uri="$MONGODB_URI" --drop ./backup-before-migration

if [ $? -eq 0 ]; then
    echo "✅ Restore สำเร็จ!"
else
    echo "❌ Restore ล้มเหลว"
    exit 1
fi
