#!/bin/bash
set -e

echo "════════════════════════════════════════════════════════════════"
echo "🆘 RECUPERAÇÃO URGENTE - RDS CLUSTERS TWIGGY"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "⚠️  Os clusters RDS foram deletados acidentalmente pelo Pulumi"
echo "⚠️  Este script vai tentar recuperá-los dos snapshots"
echo ""
echo "Contas:"
echo "  - Root (snapshots): 440041991649"
echo "  - Nonprod (destino): 632185211638"
echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""

# Configurar região
REGION="us-east-1"
ACCOUNT_ROOT="440041991649"
ACCOUNT_NONPROD="632185211638"

echo "1️⃣ VERIFICANDO SNAPSHOTS NA CONTA ROOT (${ACCOUNT_ROOT})"
echo "─────────────────────────────────────────────────────────────────"

# Verificar snapshots do twiggy-stg-cluster
echo ""
echo "📸 Snapshots do twiggy-stg-cluster:"
aws rds describe-db-cluster-snapshots \
  --region ${REGION} \
  --query 'DBClusterSnapshots[?contains(DBClusterSnapshotIdentifier, `twiggy-stg`)].[DBClusterSnapshotIdentifier,Status,SnapshotCreateTime,DBClusterIdentifier]' \
  --output table || echo "❌ Erro ao buscar snapshots (verifique credenciais AWS)"

# Verificar snapshots do twiggy-v2
echo ""
echo "📸 Snapshots do twiggy-v2-stg-auroracluster:"
aws rds describe-db-cluster-snapshots \
  --region ${REGION} \
  --query 'DBClusterSnapshots[?contains(DBClusterSnapshotIdentifier, `twiggy-v2-stg`)].[DBClusterSnapshotIdentifier,Status,SnapshotCreateTime,DBClusterIdentifier]' \
  --output table || echo "❌ Erro ao buscar snapshots (verifique credenciais AWS)"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "2️⃣ VERIFICANDO SNAPSHOTS FINAIS (criados na deleção)"
echo "─────────────────────────────────────────────────────────────────"

# Verificar snapshots mais recentes (criados automaticamente na deleção)
echo ""
echo "📸 Snapshots finais (últimas 24h):"
aws rds describe-db-cluster-snapshots \
  --region ${REGION} \
  --query 'DBClusterSnapshots[?SnapshotCreateTime>=`'$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S)'`].[DBClusterSnapshotIdentifier,Status,SnapshotCreateTime,DBClusterIdentifier]' \
  --output table || echo "❌ Erro ao buscar snapshots recentes"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "3️⃣ COMANDOS DE RECUPERAÇÃO"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Após identificar os snapshots corretos, use os comandos abaixo:"
echo ""

cat << 'EOF'
# ═══════════════════════════════════════════════════════════════════
# OPÇÃO A: Restaurar do snapshot de migração (conta root)
# ═══════════════════════════════════════════════════════════════════

# 1. Compartilhar snapshot da conta root para nonprod (se necessário)
aws rds modify-db-cluster-snapshot-attribute \
  --db-cluster-snapshot-identifier twiggy-stg-migration-snapshot-11-3-2025 \
  --attribute-name restore \
  --values-to-add 632185211638 \
  --region us-east-1

# 2. Restaurar cluster twiggy-stg-cluster
aws rds restore-db-cluster-from-snapshot \
  --db-cluster-identifier twiggy-stg-cluster \
  --snapshot-identifier arn:aws:rds:us-east-1:440041991649:cluster-snapshot:twiggy-stg-migration-snapshot-11-3-2025 \
  --engine aurora-postgresql \
  --engine-version 15.12 \
  --serverless-v2-scaling-configuration MinCapacity=0.5,MaxCapacity=1.0 \
  --vpc-security-group-ids <SECURITY_GROUP_ID> \
  --db-subnet-group-name <SUBNET_GROUP_NAME> \
  --region us-east-1

# 3. Criar instância writer
aws rds create-db-instance \
  --db-instance-identifier twiggy-stg-0 \
  --db-instance-class db.serverless \
  --engine aurora-postgresql \
  --db-cluster-identifier twiggy-stg-cluster \
  --region us-east-1

# 4. Repetir para twiggy-v2-stg-auroracluster
aws rds restore-db-cluster-from-snapshot \
  --db-cluster-identifier twiggy-v2-stg-auroracluster-snddpbtogcwz \
  --snapshot-identifier arn:aws:rds:us-east-1:440041991649:cluster-snapshot:twiggy-v2-stg-auroracluster-snddpbtogcwz-migration-1132025 \
  --engine aurora-postgresql \
  --engine-version 15.12 \
  --serverless-v2-scaling-configuration MinCapacity=0.5,MaxCapacity=1.0 \
  --vpc-security-group-ids <SECURITY_GROUP_ID> \
  --db-subnet-group-name <SUBNET_GROUP_NAME> \
  --region us-east-1

aws rds create-db-instance \
  --db-instance-identifier twiggy-v2-stg-aurorainstance \
  --db-instance-class db.serverless \
  --engine aurora-postgresql \
  --db-cluster-identifier twiggy-v2-stg-auroracluster-snddpbtogcwz \
  --region us-east-1

# ═══════════════════════════════════════════════════════════════════
# OPÇÃO B: Restaurar do snapshot FINAL (criado na deleção)
# ═══════════════════════════════════════════════════════════════════
# Se o RDS criou snapshot automático ao deletar, use esse snapshot
# (ele estará na conta nonprod 632185211638)

# Substituir <SNAPSHOT_ID_FINAL> pelo ID do snapshot final
aws rds restore-db-cluster-from-snapshot \
  --db-cluster-identifier twiggy-stg-cluster \
  --snapshot-identifier <SNAPSHOT_ID_FINAL> \
  --engine aurora-postgresql \
  --engine-version 15.12 \
  --serverless-v2-scaling-configuration MinCapacity=0.5,MaxCapacity=1.0 \
  --region us-east-1

# ═══════════════════════════════════════════════════════════════════
# OPÇÃO C: Copiar databases da conta root (se clusters ainda existem lá)
# ═══════════════════════════════════════════════════════════════════

# 1. Criar snapshot do cluster na conta root
aws rds create-db-cluster-snapshot \
  --db-cluster-snapshot-identifier twiggy-recovery-$(date +%Y%m%d-%H%M%S) \
  --db-cluster-identifier <CLUSTER_ID_NA_ROOT> \
  --region us-east-1

# 2. Compartilhar com conta nonprod
aws rds modify-db-cluster-snapshot-attribute \
  --db-cluster-snapshot-identifier twiggy-recovery-$(date +%Y%m%d-%H%M%S) \
  --attribute-name restore \
  --values-to-add 632185211638 \
  --region us-east-1

# 3. Restaurar na conta nonprod
aws rds restore-db-cluster-from-snapshot \
  --db-cluster-identifier twiggy-stg-cluster \
  --snapshot-identifier arn:aws:rds:us-east-1:440041991649:cluster-snapshot:twiggy-recovery-<TIMESTAMP> \
  --engine aurora-postgresql \
  --engine-version 15.12 \
  --serverless-v2-scaling-configuration MinCapacity=0.5,MaxCapacity=1.0 \
  --region us-east-1

EOF

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "4️⃣ PRÓXIMOS PASSOS APÓS RECUPERAÇÃO"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "1. Aguardar clusters ficarem 'available' (10-15 minutos)"
echo "2. Atualizar connection strings nos Secrets Manager"
echo "3. Remover RDS do Pulumi state para evitar novas deleções:"
echo ""
echo "   cd /home/rasputin/DNX/twiggy/infra/app-ecs"
echo "   pulumi state delete 'aws:rds/cluster:Cluster::twiggy-stg-cluster' || true"
echo "   pulumi state delete 'aws:rds/clusterInstance:ClusterInstance::twiggy-stg-0' || true"
echo "   pulumi state delete 'aws:rds/cluster:Cluster::twiggy-v2-stg-auroracluster-snddpbtogcwz' || true"
echo ""
echo "════════════════════════════════════════════════════════════════"
