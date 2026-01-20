# Plano de Ação - Recuperação RDS Urgente

**Data:** 2025-11-19
**Gravidade:** 🔴 CRÍTICA
**Status:** ⏳ AGUARDANDO EXECUÇÃO

---

## 🚨 RESUMO DO INCIDENTE

Durante o provisionamento do Pulumi, os seguintes clusters RDS foram **DELETADOS ACIDENTALMENTE**:

1. **twiggy-stg-cluster** (Aurora PostgreSQL 15.12 Serverless v2)
   - Instância: twiggy-stg-0
   - Tempo de deleção: 731 segundos

2. **twiggy-v2-stg-auroracluster-snddpbtogcwz** (Aurora PostgreSQL 15.12 Serverless v2)
   - Instância: twiggy-v2-stg-aurorainstance

**Causa raiz:** Alteração de `cluster: [...]` para `cluster: []` no arquivo `rds.yaml`, interpretado pelo Pulumi como comando de deleção.

---

## 📋 AÇÕES IMEDIATAS NECESSÁRIAS

### ✅ Já Concluído

- ✅ Script de recuperação automático criado: `RECOVERY_RDS_URGENTE.sh`
- ✅ Guia manual de recuperação criado: `MANUAL_RECOVERY_GUIDE.md`
- ✅ Script de limpeza do Pulumi state: `CLEANUP_PULUMI_STATE.sh`

### ⏳ Aguardando Execução (VOCÊ DEVE FAZER AGORA)

#### 1. **RECUPERAR DATABASES (URGENTE - 30 minutos)**

Você tem 3 opções de recuperação (em ordem de preferência):

**Opção A: Snapshots Finais (criados automaticamente na deleção)**
```bash
cd /home/rasputin/DNX/twiggy/infra/app-ecs
bash RECOVERY_RDS_URGENTE.sh
```

Este script irá:
- Buscar snapshots criados nas últimas 24h na conta nonprod (632185211638)
- Buscar snapshots de migração na conta root (440041991649)
- Mostrar comandos de restauração

**Opção B: Recuperação Manual via Console AWS**
1. Acesse: https://console.aws.amazon.com/rds/home?region=us-east-1#snapshots-list
2. Procure por snapshots criados HOJE (2025-11-19)
3. Ou procure snapshots:
   - `twiggy-stg-migration-snapshot-11-3-2025`
   - `twiggy-v2-stg-auroracluster-snddpbtogcwz-migration-1132025`
4. Clique em "Restore snapshot" e siga o wizard

**Opção C: Copiar da Conta Root (se databases ainda existem lá)**
- Se os databases ainda não foram migrados da conta root (440041991649)
- Acesse a conta root e crie novos snapshots
- Compartilhe com a conta nonprod (632185211638)
- Restaure na nonprod

**Documentação completa:** Ver `MANUAL_RECOVERY_GUIDE.md`

#### 2. **VALIDAR RECUPERAÇÃO (5 minutos)**

Após restaurar, verifique:

```bash
# Verificar clusters
aws rds describe-db-clusters \
  --region us-east-1 \
  --query 'DBClusters[?contains(DBClusterIdentifier, `twiggy`)].[DBClusterIdentifier,Status,Endpoint]' \
  --output table

# Verificar instâncias
aws rds describe-db-instances \
  --region us-east-1 \
  --query 'DBInstances[?contains(DBInstanceIdentifier, `twiggy`)].[DBInstanceIdentifier,DBInstanceStatus]' \
  --output table
```

**Resultado esperado:**
- Status: `available`
- Endpoints funcionando

#### 3. **ATUALIZAR SECRETS MANAGER (5 minutos)**

```bash
# Obter endpoints dos clusters recuperados
ENDPOINT_STG=$(aws rds describe-db-clusters \
  --db-cluster-identifier twiggy-stg-cluster \
  --region us-east-1 \
  --query 'DBClusters[0].Endpoint' \
  --output text)

ENDPOINT_V2=$(aws rds describe-db-clusters \
  --db-cluster-identifier twiggy-v2-stg-auroracluster-snddpbtogcwz \
  --region us-east-1 \
  --query 'DBClusters[0].Endpoint' \
  --output text)

echo "Endpoint STG: $ENDPOINT_STG"
echo "Endpoint V2: $ENDPOINT_V2"

# Atualizar secrets (ajuste DATABASE_URL conforme necessário)
aws secretsmanager put-secret-value \
  --secret-id /app/ecs/twiggy-api \
  --secret-string "{\"DATABASE_URL\":\"postgresql://user:password@${ENDPOINT_STG}:5432/twiggy\",\"JWT_SECRET\":\"...\"}" \
  --region us-east-1

# Repetir para twiggy-worker e twiggy-shopify
```

#### 4. **LIMPAR PULUMI STATE (2 minutos) - CRÍTICO**

**APÓS RECUPERAÇÃO COMPLETA**, execute:

```bash
cd /home/rasputin/DNX/twiggy/infra/app-ecs
bash CLEANUP_PULUMI_STATE.sh
```

Este script:
- Remove recursos RDS do Pulumi state
- Valida que rds.yaml está vazio
- Garante que Pulumi NÃO tentará gerenciar RDS no futuro

**IMPORTANTE:** Executar SOMENTE após recuperar os databases!

#### 5. **VALIDAR PULUMI (5 minutos)**

Após limpar o state, valide que o Pulumi não vai tocar em RDS:

```bash
cd /home/rasputin/DNX/twiggy/infra/app-ecs
pulumi stack select twiggy-org/app-ecs/nonprod
pulumi preview
```

**Resultado esperado:**
- Nenhuma alteração em recursos RDS
- Preview deve mostrar 0 recursos para criar/atualizar/deletar
- Ou apenas atualizações em ECS/ALB/etc (não RDS)

Se aparecer qualquer operação em RDS, **NÃO EXECUTE pulumi up** e peça ajuda.

---

## 📊 CHECKLIST COMPLETO

```
[ ] 1. Executar RECOVERY_RDS_URGENTE.sh ou recuperar via Console
[ ] 2. Aguardar clusters ficarem "available" (10-15 min)
[ ] 3. Validar que clusters estão online e acessíveis
[ ] 4. Obter endpoints dos clusters recuperados
[ ] 5. Atualizar Secrets Manager com novos endpoints
[ ] 6. Testar conexão com databases
[ ] 7. Executar CLEANUP_PULUMI_STATE.sh
[ ] 8. Executar pulumi preview para validar
[ ] 9. Atualizar VALIDATION_REPORT.md (status de RDS)
[ ] 10. Prosseguir com deployment das aplicações
```

---

## ⏱️ TEMPO TOTAL ESTIMADO

- **Recuperação:** 10-15 minutos (tempo de restauração do snapshot)
- **Criação de instâncias:** 5-10 minutos
- **Atualização de secrets:** 5 minutos
- **Limpeza Pulumi:** 2 minutos
- **Validação:** 5 minutos
- **TOTAL:** 30-40 minutos

---

## 🔧 ARQUIVOS CRIADOS PARA VOCÊ

### 1. `/home/rasputin/DNX/twiggy/infra/app-ecs/RECOVERY_RDS_URGENTE.sh`
Script automático que:
- Verifica snapshots em ambas as contas
- Mostra comandos de recuperação prontos para usar
- Executável com `bash RECOVERY_RDS_URGENTE.sh`

### 2. `/home/rasputin/DNX/twiggy/infra/app-ecs/MANUAL_RECOVERY_GUIDE.md`
Guia passo-a-passo completo com:
- 3 opções de recuperação
- Comandos AWS CLI detalhados
- Checklist de validação
- Lições aprendidas

### 3. `/home/rasputin/DNX/twiggy/infra/app-ecs/CLEANUP_PULUMI_STATE.sh`
Script de limpeza que:
- Remove RDS do Pulumi state
- Valida que rds.yaml está correto
- Previne futuras deleções acidentais
- Executável com `bash CLEANUP_PULUMI_STATE.sh`

### 4. `/home/rasputin/DNX/twiggy/infra/app-ecs/ACTION_PLAN_RECOVERY.md` (este arquivo)
Resumo executivo com plano de ação.

---

## 🚨 IMPORTANTE - NÃO EXECUTE PULUMI UP ATÉ COMPLETAR RECOVERY

**NÃO execute `pulumi up` até:**
1. ✅ Databases recuperados
2. ✅ Pulumi state limpo (CLEANUP_PULUMI_STATE.sh executado)
3. ✅ pulumi preview validado (sem alterações em RDS)

Executar `pulumi up` antes disso pode causar novos problemas.

---

## 📞 PRÓXIMOS PASSOS APÓS RECOVERY

Após completar a recuperação:

1. **Atualizar documentação:**
   - Marcar RDS como recuperado no VALIDATION_REPORT.md
   - Documentar lições aprendidas

2. **Configurar proteção em produção:**
   - Adicionar `protect: true` em recursos RDS críticos
   - Configurar CloudWatch Alarms para monitorar RDS
   - Configurar backups automáticos

3. **Prosseguir com deployment:**
   - Configurar secrets restantes
   - Configurar DNS (Route53)
   - Fazer primeiro deployment via GitHub Actions

---

## 🎯 COMANDOS RÁPIDOS

```bash
# Verificar status atual
cd /home/rasputin/DNX/twiggy/infra/app-ecs

# 1. Tentar recuperação automática
bash RECOVERY_RDS_URGENTE.sh

# 2. Após recuperação, limpar state
bash CLEANUP_PULUMI_STATE.sh

# 3. Validar Pulumi
pulumi preview

# 4. Verificar clusters
aws rds describe-db-clusters \
  --region us-east-1 \
  --query 'DBClusters[?contains(DBClusterIdentifier, `twiggy`)]' \
  --output table
```

---

## ⚠️ O QUE DEU ERRADO E COMO EVITAR

**Problema:**
```yaml
# ANTES (tentou restaurar de snapshot)
cluster:
  - name: "twiggy-stg-cluster"
    snapshotId: "arn:aws:..."

# DEPOIS (causou DELEÇÃO)
cluster: []
```

**Por que deletou:**
- Pulumi viu `cluster: []` como "não deve haver clusters"
- Tentou reconciliar o estado atual (clusters existentes) com o desejado (vazio)
- Executou deleção dos clusters

**Solução correta:**
```bash
# Em vez de alterar rds.yaml para []
# Use pulumi state delete para remover do state SEM deletar na AWS:
pulumi state delete 'aws:rds/cluster:Cluster::twiggy-stg-cluster' --yes
```

**Prevenção futura:**
1. SEMPRE execute `pulumi preview` antes de `pulumi up`
2. NUNCA altere arrays de recursos para `[]` se recursos existem
3. Use `pulumi state delete` para remover do state sem deletar na AWS
4. Configure `protect: true` em recursos críticos
5. Mantenha snapshots atualizados

---

## 📚 DOCUMENTAÇÃO DE REFERÊNCIA

- AWS RDS Restore from Snapshot: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_RestoreFromSnapshot.html
- Pulumi State Management: https://www.pulumi.com/docs/cli/commands/pulumi_state/
- AWS RDS Snapshots: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_CreateSnapshot.html

---

**CRIADO EM:** 2025-11-19
**URGÊNCIA:** 🔴 CRÍTICA
**AÇÃO NECESSÁRIA:** IMEDIATA

**EXECUTE A RECUPERAÇÃO AGORA!**
