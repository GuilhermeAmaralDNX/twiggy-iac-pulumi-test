#!/bin/bash
set -e

echo "🔄 CRIANDO SNAPSHOTS NA CONTA ROOT"
echo ""

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
REGION="us-east-1"

# 1. Verificar clusters existentes na conta root
echo "1️⃣ Verificando clusters na conta root..."
aws rds describe-db-clusters \
  --region ${REGION} \
  --query 'DBClusters[?contains(DBClusterIdentifier, `twiggy`)].[DBClusterIdentifier,Status,Engine,EngineVersion]' \
  --output table

echo ""
echo "2️⃣ Criando snapshot do twiggy-stg-cluster..."
aws rds create-db-cluster-snapshot \
  --db-cluster-snapshot-identifier twiggy-stg-snapshot-${TIMESTAMP} \
  --db-cluster-identifier twiggy-stg-cluster \
  --region ${REGION}

echo ""
echo "3️⃣ Criando snapshot do twiggy-v2-stg-auroracluster-snddpbtogcwz..."
aws rds create-db-cluster-snapshot \
  --db-cluster-snapshot-identifier twiggy-v2-stg-snapshot-${TIMESTAMP} \
  --db-cluster-identifier twiggy-v2-stg-auroracluster-snddpbtogcwz \
  --region ${REGION}

echo ""
echo "4️⃣ Aguardando snapshots ficarem disponíveis (5-10 min)..."
aws rds wait db-cluster-snapshot-available \
  --db-cluster-snapshot-identifier twiggy-stg-snapshot-${TIMESTAMP} \
  --region ${REGION}

aws rds wait db-cluster-snapshot-available \
  --db-cluster-snapshot-identifier twiggy-v2-stg-snapshot-${TIMESTAMP} \
  --region ${REGION}

echo ""
echo "5️⃣ Compartilhando snapshots com conta nonprod (632185211638)..."
aws rds modify-db-cluster-snapshot-attribute \
  --db-cluster-snapshot-identifier twiggy-stg-snapshot-${TIMESTAMP} \
  --attribute-name restore \
  --values-to-add 632185211638 \
  --region ${REGION}

aws rds modify-db-cluster-snapshot-attribute \
  --db-cluster-snapshot-identifier twiggy-v2-stg-snapshot-${TIMESTAMP} \
  --attribute-name restore \
  --values-to-add 632185211638 \
  --region ${REGION}

echo ""
echo "✅ SNAPSHOTS CRIADOS E COMPARTILHADOS!"
echo ""
echo "📋 IDs dos snapshots:"
echo "   twiggy-stg-snapshot-${TIMESTAMP}"
echo "   twiggy-v2-stg-snapshot-${TIMESTAMP}"
echo ""
echo "🔗 ARNs completos:"
echo "   arn:aws:rds:us-east-1:440041991649:cluster-snapshot:twiggy-stg-snapshot-${TIMESTAMP}"
echo "   arn:aws:rds:us-east-1:440041991649:cluster-snapshot:twiggy-v2-stg-snapshot-${TIMESTAMP}"
echo ""
echo "⚠️ PRÓXIMO PASSO: Atualizar rds.yaml com esses ARNs"
