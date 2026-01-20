# Guia Manual de Recuperação RDS - URGENTE

**Data do Incidente:** 2025-11-19
**Clusters Deletados:** twiggy-stg-cluster, twiggy-v2-stg-auroracluster-snddpbtogcwz
**Causa:** Pulumi interpretou `cluster: []` como comando de deleção

---

## ⚠️ SITUAÇÃO ATUAL

Os seguintes clusters RDS foram **DELETADOS** durante o `pulumi up`:

1. **twiggy-stg-cluster** (deletado em 731 segundos)
2. **twiggy-v2-stg-auroracluster-snddpbtogcwz** (status desconhecido)

---

## 🔍 PASSO 1: VERIFICAR SNAPSHOTS (CRÍTICO)

### Opção A: Snapshots Finais (criados automaticamente na deleção)

O RDS cria snapshots automáticos quando clusters são deletados. Verifique na conta nonprod:

```bash
# Configure AWS CLI para conta nonprod (632185211638)
aws configure --profile twiggy-nonprod
# AWS Access Key ID: <YOUR_ACCESS_KEY>
# AWS Secret Access Key: <YOUR_SECRET_KEY>
# Default region: us-east-1

# Buscar snapshots criados hoje
aws rds describe-db-cluster-snapshots \
  --region us-east-1 \
  --profile twiggy-nonprod \
  --query 'DBClusterSnapshots[?SnapshotCreateTime>=`'$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S)'`].[DBClusterSnapshotIdentifier,Status,SnapshotCreateTime,DBClusterIdentifier]' \
  --output table
```

**Se encontrar snapshots recentes, ANOTE OS IDs e pule para PASSO 2.**

### Opção B: Snapshots de Migração (conta root 440041991649)

Os snapshots de migração originais estão na conta twiggy-root:

```bash
# Configure AWS CLI para conta root (440041991649)
aws configure --profile twiggy-root
# (credenciais da conta root - solicitar ao responsável)

# Verificar snapshots de migração
aws rds describe-db-cluster-snapshots \
  --region us-east-1 \
  --profile twiggy-root \
  --query 'DBClusterSnapshots[?contains(DBClusterSnapshotIdentifier, `twiggy-stg`)].[DBClusterSnapshotIdentifier,Status,SnapshotCreateTime]' \
  --output table

aws rds describe-db-cluster-snapshots \
  --region us-east-1 \
  --profile twiggy-root \
  --query 'DBClusterSnapshots[?contains(DBClusterSnapshotIdentifier, `twiggy-v2-stg`)].[DBClusterSnapshotIdentifier,Status,SnapshotCreateTime]' \
  --output table
```

**Snapshots esperados:**
- `twiggy-stg-migration-snapshot-11-3-2025`
- `twiggy-v2-stg-auroracluster-snddpbtogcwz-migration-1132025`

### Opção C: Databases Ainda Existem na Conta Root

Se os databases ainda existem na conta root (não foram migrados ainda):

```bash
# Verificar clusters na conta root
aws rds describe-db-clusters \
  --region us-east-1 \
  --profile twiggy-root \
  --query 'DBClusters[?contains(DBClusterIdentifier, `twiggy`)].[DBClusterIdentifier,Status,Endpoint]' \
  --output table
```

**Se existirem, pule para PASSO 3 (copiar da root).**

---

## 🛠️ PASSO 2: RESTAURAR DO SNAPSHOT

### Cenário 2A: Restaurar de Snapshot Final (conta nonprod)

Use este comando se encontrou snapshots finais criados hoje:

```bash
# Substituir <SNAPSHOT_ID_FINAL> pelo ID encontrado no Passo 1

# Restaurar twiggy-stg-cluster
aws rds restore-db-cluster-from-snapshot \
  --db-cluster-identifier twiggy-stg-cluster \
  --snapshot-identifier <SNAPSHOT_ID_FINAL> \
  --engine aurora-postgresql \
  --engine-version 15.12 \
  --serverless-v2-scaling-configuration MinCapacity=0.5,MaxCapacity=1.0 \
  --vpc-security-group-ids sg-XXXXXX \
  --db-subnet-group-name rds-subnet-group-nonprod \
  --region us-east-1 \
  --profile twiggy-nonprod

# Aguardar cluster ficar disponível (10-15 minutos)
aws rds wait db-cluster-available \
  --db-cluster-identifier twiggy-stg-cluster \
  --region us-east-1 \
  --profile twiggy-nonprod

# Criar instância writer
aws rds create-db-instance \
  --db-instance-identifier twiggy-stg-0 \
  --db-instance-class db.serverless \
  --engine aurora-postgresql \
  --db-cluster-identifier twiggy-stg-cluster \
  --region us-east-1 \
  --profile twiggy-nonprod

# Repetir para twiggy-v2 se necessário
```

### Cenário 2B: Restaurar de Snapshot de Migração (conta root)

Use este comando se vai usar snapshots da conta root:

```bash
# 1. Compartilhar snapshot da conta root para nonprod
aws rds modify-db-cluster-snapshot-attribute \
  --db-cluster-snapshot-identifier twiggy-stg-migration-snapshot-11-3-2025 \
  --attribute-name restore \
  --values-to-add 632185211638 \
  --region us-east-1 \
  --profile twiggy-root

# 2. Aguardar compartilhamento (1-2 minutos)
sleep 120

# 3. Restaurar na conta nonprod
aws rds restore-db-cluster-from-snapshot \
  --db-cluster-identifier twiggy-stg-cluster \
  --snapshot-identifier arn:aws:rds:us-east-1:440041991649:cluster-snapshot:twiggy-stg-migration-snapshot-11-3-2025 \
  --engine aurora-postgresql \
  --engine-version 15.12 \
  --serverless-v2-scaling-configuration MinCapacity=0.5,MaxCapacity=1.0 \
  --vpc-security-group-ids sg-XXXXXX \
  --db-subnet-group-name rds-subnet-group-nonprod \
  --region us-east-1 \
  --profile twiggy-nonprod

# 4. Criar instância writer
aws rds create-db-instance \
  --db-instance-identifier twiggy-stg-0 \
  --db-instance-class db.serverless \
  --engine aurora-postgresql \
  --db-cluster-identifier twiggy-stg-cluster \
  --region us-east-1 \
  --profile twiggy-nonprod
```

**⚠️ IMPORTANTE:** Antes de executar, obtenha os valores corretos:

```bash
# Obter Security Group ID do RDS
aws ec2 describe-security-groups \
  --filters "Name=tag:Name,Values=*rds*" \
  --region us-east-1 \
  --profile twiggy-nonprod \
  --query 'SecurityGroups[0].GroupId' \
  --output text

# Obter Subnet Group Name
aws rds describe-db-subnet-groups \
  --region us-east-1 \
  --profile twiggy-nonprod \
  --query 'DBSubnetGroups[0].DBSubnetGroupName' \
  --output text
```

---

## 📋 PASSO 3: COPIAR DA CONTA ROOT (se databases existem lá)

Se os databases ainda existem na conta root e não há snapshots adequados:

```bash
# 1. Criar snapshot na conta root
aws rds create-db-cluster-snapshot \
  --db-cluster-snapshot-identifier twiggy-recovery-$(date +%Y%m%d-%H%M%S) \
  --db-cluster-identifier <CLUSTER_ID_NA_ROOT> \
  --region us-east-1 \
  --profile twiggy-root

# 2. Aguardar snapshot completar
aws rds wait db-cluster-snapshot-available \
  --db-cluster-snapshot-identifier twiggy-recovery-$(date +%Y%m%d-%H%M%S) \
  --region us-east-1 \
  --profile twiggy-root

# 3. Compartilhar com nonprod
aws rds modify-db-cluster-snapshot-attribute \
  --db-cluster-snapshot-identifier twiggy-recovery-YYYYMMDD-HHMMSS \
  --attribute-name restore \
  --values-to-add 632185211638 \
  --region us-east-1 \
  --profile twiggy-root

# 4. Restaurar na nonprod (usar comando do Cenário 2B)
```

---

## ✅ PASSO 4: VALIDAR RECUPERAÇÃO

Após restaurar os clusters:

```bash
# Verificar status dos clusters
aws rds describe-db-clusters \
  --region us-east-1 \
  --profile twiggy-nonprod \
  --query 'DBClusters[?contains(DBClusterIdentifier, `twiggy`)].[DBClusterIdentifier,Status,Endpoint]' \
  --output table

# Verificar instâncias
aws rds describe-db-instances \
  --region us-east-1 \
  --profile twiggy-nonprod \
  --query 'DBInstances[?contains(DBInstanceIdentifier, `twiggy`)].[DBInstanceIdentifier,DBInstanceStatus,Endpoint.Address]' \
  --output table

# Testar conexão (quando disponível)
psql "postgresql://username:password@<ENDPOINT>:5432/dbname" -c "SELECT version();"
```

**Endpoints esperados:**
- `twiggy-stg-cluster.cluster-XXXXX.us-east-1.rds.amazonaws.com`
- `twiggy-v2-stg-auroracluster-snddpbtogcwz.cluster-XXXXX.us-east-1.rds.amazonaws.com`

---

## 🔒 PASSO 5: ATUALIZAR SECRETS MANAGER

Após recuperação, atualize os secrets com os novos endpoints:

```bash
# Obter endpoint do cluster
ENDPOINT=$(aws rds describe-db-clusters \
  --db-cluster-identifier twiggy-stg-cluster \
  --region us-east-1 \
  --profile twiggy-nonprod \
  --query 'DBClusters[0].Endpoint' \
  --output text)

# Atualizar secret da API
aws secretsmanager put-secret-value \
  --secret-id /app/ecs/twiggy-api \
  --secret-string "{\"DATABASE_URL\":\"postgresql://user:pass@${ENDPOINT}:5432/twiggy\"}" \
  --region us-east-1 \
  --profile twiggy-nonprod

# Repetir para twiggy-worker e twiggy-shopify
```

---

## 🧹 PASSO 6: LIMPAR PULUMI STATE (CRÍTICO)

**APÓS RECUPERAÇÃO COMPLETA**, remova os clusters do Pulumi state para evitar novas deleções:

```bash
cd /home/rasputin/DNX/twiggy/infra/app-ecs

# Remover clusters do state
pulumi state delete 'aws:rds/cluster:Cluster::twiggy-stg-cluster' --yes || true
pulumi state delete 'aws:rds/clusterInstance:ClusterInstance::twiggy-stg-0' --yes || true
pulumi state delete 'aws:rds/cluster:Cluster::twiggy-v2-stg-auroracluster-snddpbtogcwz' --yes || true
pulumi state delete 'aws:rds/clusterInstance:ClusterInstance::twiggy-v2-stg-aurorainstance' --yes || true

# Verificar que foram removidos
pulumi stack export | jq '.deployment.resources[] | select(.type=="aws:rds/cluster:Cluster")'
# Deve retornar vazio
```

**Manter rds.yaml vazio:**
```yaml
# rds.yaml deve permanecer assim:
instance: []
cluster: []
```

Isso garante que o Pulumi **não tente gerenciar** os clusters RDS.

---

## 📊 CHECKLIST DE RECUPERAÇÃO

- [ ] **Passo 1:** Verificar snapshots (nonprod, root, ou databases vivos)
- [ ] **Passo 2:** Restaurar twiggy-stg-cluster do snapshot
- [ ] **Passo 2:** Criar instância twiggy-stg-0
- [ ] **Passo 2:** Restaurar twiggy-v2-stg-auroracluster-snddpbtogcwz
- [ ] **Passo 2:** Criar instância twiggy-v2-stg-aurorainstance
- [ ] **Passo 3:** Aguardar clusters ficarem "available" (10-15 min)
- [ ] **Passo 4:** Validar conexão com clusters
- [ ] **Passo 5:** Atualizar Secrets Manager com novos endpoints
- [ ] **Passo 6:** Limpar Pulumi state (pulumi state delete)
- [ ] **Passo 6:** Verificar que RDS não está mais no state
- [ ] **Final:** Testar deployment de aplicações

---

## ⏱️ TEMPO ESTIMADO

- **Restauração de snapshot:** 10-15 minutos
- **Criação de instâncias:** 5-10 minutos
- **Atualização de secrets:** 2 minutos
- **Limpeza Pulumi state:** 1 minuto
- **Total:** 20-30 minutos

---

## 🚨 CONTATO DE EMERGÊNCIA

Se precisar de ajuda adicional:
1. Verifique logs do Pulumi: `/home/rasputin/DNX/twiggy/infra/app-ecs/pulumi-output.log`
2. Consulte RDS console: https://console.aws.amazon.com/rds/home?region=us-east-1
3. Consulte snapshots: https://console.aws.amazon.com/rds/home?region=us-east-1#snapshots-list:

---

## 📝 LIÇÕES APRENDIDAS

**O que causou o problema:**
- Alterar `cluster: [...]` para `cluster: []` no rds.yaml
- Pulumi interpretou como "deletar os clusters que existem no state"
- **NÃO havia clusters no Pulumi state**, mas Pulumi tentou reconciliar e deletou

**Como evitar no futuro:**
1. **NUNCA** altere arrays de recursos para `[]` quando recursos já existem
2. **SEMPRE** use `pulumi state delete` para remover recursos do state
3. **SEMPRE** faça `pulumi preview` antes de `pulumi up`
4. **SEMPRE** mantenha backups/snapshots atualizados
5. Considere usar `protect: true` em recursos críticos de produção

**Comando correto que deveria ter sido usado:**
```bash
# Em vez de alterar rds.yaml para cluster: []
pulumi state delete 'aws:rds/cluster:Cluster::twiggy-stg-cluster' --yes
```

Isso remove do state SEM deletar na AWS.

---

**EXECUTE ESTE GUIA IMEDIATAMENTE!**
