#!/bin/bash
set -e

echo "🔧 ATUALIZANDO rds.yaml COM ARNs DOS SNAPSHOTS"
echo ""

# Verificar se foram fornecidos os ARNs como argumentos
if [ $# -eq 2 ]; then
    ARN_SNAPSHOT_1=$1
    ARN_SNAPSHOT_2=$2
else
    echo "❓ Forneça os ARNs dos snapshots criados:"
    echo ""
    read -p "ARN do twiggy-stg-snapshot: " ARN_SNAPSHOT_1
    read -p "ARN do twiggy-v2-stg-snapshot: " ARN_SNAPSHOT_2
fi

echo ""
echo "📋 ARNs fornecidos:"
echo "   Snapshot 1: $ARN_SNAPSHOT_1"
echo "   Snapshot 2: $ARN_SNAPSHOT_2"
echo ""

# Atualizar rds.yaml
sed -i "s|PLACEHOLDER_ARN_SNAPSHOT_1|$ARN_SNAPSHOT_1|g" inputs/nonprod/rds.yaml
sed -i "s|PLACEHOLDER_ARN_SNAPSHOT_2|$ARN_SNAPSHOT_2|g" inputs/nonprod/rds.yaml

echo "✅ rds.yaml atualizado!"
echo ""
cat inputs/nonprod/rds.yaml | grep -A 1 snapshotId
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "🚀 AGORA EXECUTE:"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "cd /home/rasputin/DNX/twiggy/infra/app-ecs"
echo "pulumi stack select twiggy-org/app-ecs/nonprod"
echo "pulumi preview"
echo ""
echo "Verifique que vai criar 2 clusters RDS e 2 instâncias."
echo "Se estiver correto, execute:"
echo ""
echo "pulumi up"
echo ""
