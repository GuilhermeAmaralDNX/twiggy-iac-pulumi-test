#!/bin/bash
set -e

echo "════════════════════════════════════════════════════════════════"
echo "🔄 MIGRAÇÃO RDS - TWIGGY ROOT → NONPROD"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Este script vai:"
echo "  1. Criar snapshots na conta root (440041991649)"
echo "  2. Compartilhar com conta nonprod (632185211638)"
echo "  3. Atualizar rds.yaml"
echo "  4. Executar Pulumi para provisionar clusters"
echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""

# Passo 1: Verificar credenciais AWS para conta root
echo "📋 PASSO 1: Configure AWS CLI para conta ROOT (440041991649)"
echo ""
echo "Execute:"
echo "  aws configure --profile twiggy-root"
echo ""
read -p "Credenciais configuradas? (pressione ENTER) "

# Passo 2: Criar snapshots
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "📸 PASSO 2: Criando snapshots na conta root..."
echo "════════════════════════════════════════════════════════════════"
echo ""

export AWS_PROFILE=twiggy-root
bash CREATE_SNAPSHOTS.sh

# Capturar timestamp do último snapshot
LATEST_SNAPSHOT=$(aws rds describe-db-cluster-snapshots \
  --region us-east-1 \
  --query 'DBClusterSnapshots[?contains(DBClusterSnapshotIdentifier, `twiggy-stg-snapshot`)] | sort_by(@, &SnapshotCreateTime)[-1].DBClusterSnapshotIdentifier' \
  --output text)

TIMESTAMP=${LATEST_SNAPSHOT##*-}

ARN_1="arn:aws:rds:us-east-1:440041991649:cluster-snapshot:twiggy-stg-snapshot-${TIMESTAMP}"
ARN_2="arn:aws:rds:us-east-1:440041991649:cluster-snapshot:twiggy-v2-stg-snapshot-${TIMESTAMP}"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "🔧 PASSO 3: Atualizando rds.yaml..."
echo "════════════════════════════════════════════════════════════════"
echo ""

bash UPDATE_RDS_CONFIG.sh "$ARN_1" "$ARN_2"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "🔄 PASSO 4: Configure AWS CLI para conta NONPROD (632185211638)"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Execute:"
echo "  aws configure --profile twiggy-nonprod"
echo "  AWS Access Key ID: <YOUR_ACCESS_KEY>"
echo "  AWS Secret Access Key: <YOUR_SECRET_KEY>"
echo ""
read -p "Credenciais configuradas? (pressione ENTER) "

export AWS_PROFILE=twiggy-nonprod

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "🚀 PASSO 5: EXECUTAR PULUMI"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Agora execute manualmente:"
echo ""
echo "  cd /home/rasputin/DNX/twiggy/infra/app-ecs"
echo "  pulumi stack select twiggy-org/app-ecs/nonprod"
echo "  pulumi preview"
echo ""
echo "Verifique que vai criar:"
echo "  - 2 RDS Clusters (twiggy-stg-cluster, twiggy-v2-stg-auroracluster-snddpbtogcwz)"
echo "  - 2 RDS Instances (twiggy-stg-0, twiggy-v2-stg-aurorainstance)"
echo ""
echo "Se estiver correto:"
echo "  pulumi up"
echo ""
echo "✅ MIGRAÇÃO COMPLETA!"
