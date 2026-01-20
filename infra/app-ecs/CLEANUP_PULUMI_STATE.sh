#!/bin/bash
set -e

echo "════════════════════════════════════════════════════════════════"
echo "🧹 LIMPEZA DO PULUMI STATE - RDS CLUSTERS"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "⚠️  Este script remove os recursos RDS do Pulumi state"
echo "⚠️  Execute SOMENTE APÓS recuperar os databases"
echo ""
echo "Recursos que serão removidos do state:"
echo "  - aws:rds/cluster:Cluster::twiggy-stg-cluster"
echo "  - aws:rds/clusterInstance:ClusterInstance::twiggy-stg-0"
echo "  - aws:rds/cluster:Cluster::twiggy-v2-stg-auroracluster-snddpbtogcwz"
echo "  - aws:rds/clusterInstance:ClusterInstance::twiggy-v2-stg-aurorainstance"
echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""

# Verificar se estamos no diretório correto
if [ ! -f "Pulumi.yaml" ]; then
    echo "❌ ERRO: Pulumi.yaml não encontrado!"
    echo "Execute este script no diretório /home/rasputin/DNX/twiggy/infra/app-ecs"
    exit 1
fi

# Verificar stack selecionado
CURRENT_STACK=$(pulumi stack --show-name 2>/dev/null || echo "NONE")
echo "📋 Stack atual: $CURRENT_STACK"

if [ "$CURRENT_STACK" != "twiggy-org/app-ecs/nonprod" ]; then
    echo ""
    echo "⚠️  Stack incorreto! Selecionando stack correto..."
    pulumi stack select twiggy-org/app-ecs/nonprod || {
        echo "❌ Erro ao selecionar stack twiggy-org/app-ecs/nonprod"
        exit 1
    }
    echo "✅ Stack selecionado: twiggy-org/app-ecs/nonprod"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "1️⃣ VERIFICANDO RECURSOS RDS NO STATE ATUAL"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Exportar state e verificar recursos RDS
echo "🔍 Buscando recursos RDS no state..."
RDS_RESOURCES=$(pulumi stack export | jq -r '.deployment.resources[] | select(.type | contains("rds")) | .type + "::" + (.id // .urn | split("::")[3])' 2>/dev/null || echo "")

if [ -z "$RDS_RESOURCES" ]; then
    echo "✅ Nenhum recurso RDS encontrado no state!"
    echo "   O state já está limpo. Nada a fazer."
    exit 0
fi

echo "📦 Recursos RDS encontrados no state:"
echo "$RDS_RESOURCES"
echo ""

echo "════════════════════════════════════════════════════════════════"
echo "2️⃣ REMOVENDO RECURSOS DO STATE"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Lista de recursos a remover (URNs completos)
RESOURCES_TO_DELETE=(
    "aws:rds/cluster:Cluster::twiggy-stg-cluster"
    "aws:rds/clusterInstance:ClusterInstance::twiggy-stg-0"
    "aws:rds/cluster:Cluster::twiggy-v2-stg-auroracluster-snddpbtogcwz"
    "aws:rds/clusterInstance:ClusterInstance::twiggy-v2-stg-aurorainstance"
)

DELETED_COUNT=0
FAILED_COUNT=0

for RESOURCE in "${RESOURCES_TO_DELETE[@]}"; do
    echo "🗑️  Removendo: $RESOURCE"

    if pulumi state delete "$RESOURCE" --yes 2>/dev/null; then
        echo "   ✅ Removido com sucesso"
        ((DELETED_COUNT++))
    else
        echo "   ⚠️  Não encontrado ou já removido (ignorando)"
        ((FAILED_COUNT++))
    fi
    echo ""
done

echo "════════════════════════════════════════════════════════════════"
echo "3️⃣ VERIFICANDO LIMPEZA"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Verificar se ainda há recursos RDS no state
RDS_REMAINING=$(pulumi stack export | jq -r '.deployment.resources[] | select(.type | contains("rds")) | .type + "::" + (.id // .urn | split("::")[3])' 2>/dev/null || echo "")

if [ -z "$RDS_REMAINING" ]; then
    echo "✅ SUCESSO! Nenhum recurso RDS permanece no state"
    echo ""
    echo "📊 Resumo:"
    echo "   - Recursos removidos: $DELETED_COUNT"
    echo "   - Recursos não encontrados: $FAILED_COUNT"
    echo ""
else
    echo "⚠️  ATENÇÃO! Ainda há recursos RDS no state:"
    echo "$RDS_REMAINING"
    echo ""
    echo "Pode ser necessário remover manualmente:"
    echo "$RDS_REMAINING" | while read -r line; do
        echo "   pulumi state delete '$line' --yes"
    done
    echo ""
fi

echo "════════════════════════════════════════════════════════════════"
echo "4️⃣ VALIDANDO CONFIGURAÇÃO RDS.YAML"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Verificar se rds.yaml está vazio
if [ -f "inputs/nonprod/rds.yaml" ]; then
    echo "📄 Verificando inputs/nonprod/rds.yaml..."

    CLUSTER_COUNT=$(grep -c "^  - name:" inputs/nonprod/rds.yaml 2>/dev/null || echo "0")

    if [ "$CLUSTER_COUNT" -eq "0" ]; then
        echo "✅ rds.yaml está correto (cluster: [], instance: [])"
        echo "   Pulumi NÃO tentará gerenciar RDS clusters"
    else
        echo "⚠️  ATENÇÃO! rds.yaml contém $CLUSTER_COUNT clusters definidos"
        echo "   Isso pode causar conflitos. Verifique o arquivo:"
        echo "   cat inputs/nonprod/rds.yaml"
    fi
else
    echo "⚠️  Arquivo inputs/nonprod/rds.yaml não encontrado!"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "5️⃣ PRÓXIMOS PASSOS"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "1. ✅ Pulumi state limpo - RDS não será mais gerenciado"
echo "2. ⚠️  Certifique-se de que os databases foram RECUPERADOS"
echo "3. ⚠️  Atualize Secrets Manager com connection strings corretos"
echo "4. ✅ Faça pulumi preview para confirmar que RDS não será tocado:"
echo ""
echo "   pulumi preview"
echo ""
echo "   (Não deve mostrar nenhuma alteração em RDS)"
echo ""
echo "5. 🚀 Prossiga com deployment das aplicações"
echo ""
echo "════════════════════════════════════════════════════════════════"
echo ""

if [ -z "$RDS_REMAINING" ]; then
    echo "✅ LIMPEZA CONCLUÍDA COM SUCESSO!"
    exit 0
else
    echo "⚠️  LIMPEZA PARCIAL - Verifique recursos restantes"
    exit 1
fi
