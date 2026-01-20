# Guia de Provisionamento - Twiggy AWS Nonprod

Este guia descreve como provisionar a infraestrutura AWS para as aplicações Twiggy usando Pulumi.

## 📋 Pré-requisitos

1. **Pulumi CLI instalado**
   ```bash
   curl -fsSL https://get.pulumi.com | sh
   ```

2. **AWS CLI configurado**
   ```bash
   aws configure --profile twiggy-nonprod
   # AWS Access Key ID: [seu access key]
   # AWS Secret Access Key: [seu secret key]
   # Default region: us-east-1
   # Default output format: json
   ```

3. **Node.js e npm instalados**
   ```bash
   node --version  # v18+
   npm --version
   ```

4. **Acesso ao Pulumi backend**
   ```bash
   pulumi login
   # OU
   export PULUMI_ACCESS_TOKEN=<seu-token>
   ```

## 🏗️ Arquitetura Provisionada

A stack `app-ecs` criará os seguintes recursos:

### ECS Cluster
- **Nome:** `dev-apps-us-east-1`
- **Capacity Providers:** FARGATE, FARGATE_SPOT, EC2 (opcional)
- **Container Insights:** Habilitado
- **Auto Scaling:** Configurado para EC2 instances

### Aplicações ECS (4 serviços)

#### 1. twiggy-api (com ALB)
- **Image:** 632185211638.dkr.ecr.us-east-1.amazonaws.com/twiggy-api:latest
- **CPU/Memory:** 256/512
- **Port:** 8080
- **Hostname:** twiggy-api.dev.twiggy.ai
- **Health Check:** GET /health
- **Auto Scaling:** 1-3 tasks (baseado em CPU/Memory)
- **Launch Type:** FARGATE

#### 2. twiggy-shopify (com ALB)
- **Image:** 632185211638.dkr.ecr.us-east-1.amazonaws.com/twiggy-shopify:latest
- **CPU/Memory:** 256/512
- **Port:** 8080
- **Hostname:** twiggy-shopify.dev.twiggy.ai
- **Health Check:** GET /health
- **Auto Scaling:** 1-2 tasks
- **Launch Type:** FARGATE

#### 3. twiggy-dashboard (com ALB)
- **Image:** 632185211638.dkr.ecr.us-east-1.amazonaws.com/twiggy-dashboard:latest
- **CPU/Memory:** 256/512
- **Port:** 80
- **Hostnames:**
  - twiggy-dashboard.dev.twiggy.ai
  - dashboard.dev.twiggy.ai
- **Health Check:** GET /health
- **Auto Scaling:** 1-2 tasks
- **Launch Type:** FARGATE

#### 4. twiggy-worker (SEM ALB)
- **Image:** 632185211638.dkr.ecr.us-east-1.amazonaws.com/twiggy-worker:latest
- **CPU/Memory:** 256/512
- **Port:** 8080 (não exposto externamente)
- **Auto Scaling:** 1-3 tasks (baseado em CPU/Memory)
- **Launch Type:** FARGATE
- **Nota:** Worker Temporal, não precisa de ALB

### Application Load Balancer (ALB)
- **ALB Externo:** Para API, Shopify e Dashboard
- **Security Groups:** Porta 80/443 aberta para internet
- **Target Groups:** Um por aplicação
- **Health Checks:** Configurados individualmente

### RDS Aurora PostgreSQL
- **Clusters existentes:**
  - twiggy-stg-cluster (Aurora Serverless v2)
  - twiggy-v2-stg-auroracluster (Aurora Serverless v2)
- **Engine:** aurora-postgresql 15.12
- **Serverless:** Min 0.5 ACU, Max 1.0 ACU
- **Backup:** 1-7 dias de retenção

### AWS Secrets Manager
- `/app/ecs/twiggy-api` - Variáveis de ambiente para API
- `/app/ecs/twiggy-worker` - Variáveis de ambiente para Worker
- `/app/ecs/twiggy-shopify` - Variáveis de ambiente para Shopify
- `/app/ecs/twiggy-dashboard` - Variáveis de ambiente para Dashboard

### IAM Roles
- **Task Execution Roles:** Para cada aplicação
  - `custom-role-dev-apps-us-east-1-twiggy-api`
  - `custom-role-dev-apps-us-east-1-twiggy-worker`
  - `custom-role-dev-apps-us-east-1-twiggy-shopify`
  - `custom-role-dev-apps-us-east-1-twiggy-dashboard`
- **Permissões:** Secrets Manager, S3, SQS (conforme necessário)

### VPC e Networking
- **VPC:** Criada pelo módulo `network`
- **Subnets:**
  - Public (ALB)
  - Private (ECS Tasks)
  - Secure (RDS)
- **NAT Gateway:** Para acesso à internet das tasks privadas
- **Security Groups:** Configurados para cada camada

## 🚀 Passo a Passo: Provisionamento

### 1. Verificar Dependências

O módulo `app-ecs` depende de outros módulos. Certifique-se de que foram provisionados primeiro:

```bash
cd /home/rasputin/DNX/twiggy/infra

# 1. AWS Root (contas, organizações)
cd aws-root
pulumi stack select twiggy-org/aws-root/root
pulumi up

# 2. Network (VPC, subnets, NAT)
cd ../network
pulumi stack select twiggy-org/network/nonprod
pulumi up

# 3. Identity (IAM roles)
cd ../identity
pulumi stack select twiggy-org/identity/nonprod
pulumi up

# 4. Utilities (ECR, ACM certificates)
cd ../utilities
pulumi stack select twiggy-org/utilities/shared
pulumi up
```

### 2. Provisionar App-ECS

```bash
cd /home/rasputin/DNX/twiggy/infra/app-ecs

# Selecionar stack nonprod
pulumi stack select twiggy-org/app-ecs/nonprod

# Instalar dependências Node
npm install

# Preview das mudanças
pulumi preview

# Aplicar mudanças (IMPORTANTE: Revisar antes!)
pulumi up
```

Durante o `pulumi up`, você verá:
- ✅ Recursos que serão criados (verde)
- 🔄 Recursos que serão atualizados (amarelo)
- ❌ Recursos que serão deletados (vermelho - cuidado!)

Digite `yes` para confirmar e provisionar.

### 3. Criar Secrets no AWS Secrets Manager

Após o provisionamento, crie os secrets com valores reais:

```bash
# API
aws secretsmanager put-secret-value \
  --secret-id /app/ecs/twiggy-api \
  --secret-string '{
    "DATABASE_URL": "postgresql://user:pass@twiggy-stg-cluster.cluster-xxx.us-east-1.rds.amazonaws.com:5432/twiggy",
    "JWT_SECRET": "seu-jwt-secret-aqui",
    "TEMPORAL_ADDRESS": "temporal.twiggy.local:7233",
    "GOOGLE_APPLICATION_CREDENTIALS": "/app/google-credentials-cloud-vision.json",
    "NODE_ENV": "development",
    "PORT": "8080"
  }' \
  --region us-east-1

# Worker
aws secretsmanager put-secret-value \
  --secret-id /app/ecs/twiggy-worker \
  --secret-string '{
    "DATABASE_URL": "postgresql://user:pass@twiggy-stg-cluster.cluster-xxx.us-east-1.rds.amazonaws.com:5432/twiggy",
    "TEMPORAL_ADDRESS": "temporal.twiggy.local:7233",
    "NODE_ENV": "development"
  }' \
  --region us-east-1

# Shopify
aws secretsmanager put-secret-value \
  --secret-id /app/ecs/twiggy-shopify \
  --secret-string '{
    "DATABASE_URL": "postgresql://user:pass@twiggy-stg-cluster.cluster-xxx.us-east-1.rds.amazonaws.com:5432/twiggy",
    "SHOPIFY_API_KEY": "seu-shopify-api-key",
    "SHOPIFY_API_SECRET": "seu-shopify-api-secret",
    "SHOPIFY_WEBHOOK_SECRET": "seu-webhook-secret",
    "NODE_ENV": "development",
    "PORT": "8080"
  }' \
  --region us-east-1

# Dashboard
aws secretsmanager put-secret-value \
  --secret-id /app/ecs/twiggy-dashboard \
  --secret-string '{
    "VITE_API_URL": "https://twiggy-api.dev.twiggy.ai",
    "VITE_GOOGLE_CLIENT_ID": "seu-google-client-id.apps.googleusercontent.com",
    "VITE_ENVIRONMENT": "development"
  }' \
  --region us-east-1
```

### 4. Configurar DNS (Route53)

Aponte os hostnames para o ALB:

```bash
# Obter DNS do ALB
aws elbv2 describe-load-balancers \
  --region us-east-1 \
  --query 'LoadBalancers[?contains(LoadBalancerName, `dev-apps`)].DNSName' \
  --output text

# Criar registros CNAME no Route53
# twiggy-api.dev.twiggy.ai -> ALB DNS
# twiggy-shopify.dev.twiggy.ai -> ALB DNS
# twiggy-dashboard.dev.twiggy.ai -> ALB DNS
# dashboard.dev.twiggy.ai -> ALB DNS
```

Ou use o console do Route53:
https://console.aws.amazon.com/route53/v2/hostedzones

### 5. Fazer Primeiro Deploy

Agora que a infraestrutura está provisionada, faça o primeiro deploy das aplicações:

```bash
cd /home/rasputin/DNX/twiggy/twiggy-core

# Fazer push para branch dnx (dispara workflows AWS)
git checkout -b dnx
git push origin dnx
```

Os workflows GitHub Actions irão:
1. Rodar testes
2. Criar repositórios ECR (se não existirem)
3. Build das imagens Docker
4. Push para ECR
5. Deploy no ECS (usando oni.sh)

## 🔍 Verificação Pós-Deploy

### 1. Verificar ECS Tasks

```bash
# Listar tasks rodando
aws ecs list-tasks \
  --cluster dev-apps-us-east-1 \
  --region us-east-1

# Descrever task específica
aws ecs describe-tasks \
  --cluster dev-apps-us-east-1 \
  --tasks <task-arn> \
  --region us-east-1
```

### 2. Verificar ALB Health Checks

```bash
# Listar target groups
aws elbv2 describe-target-groups \
  --region us-east-1

# Verificar health de targets
aws elbv2 describe-target-health \
  --target-group-arn <target-group-arn> \
  --region us-east-1
```

### 3. Verificar Logs

```bash
# API
aws logs tail /ecs/twiggy-api --follow --region us-east-1

# Worker
aws logs tail /ecs/twiggy-worker --follow --region us-east-1

# Shopify
aws logs tail /ecs/twiggy-shopify --follow --region us-east-1

# Dashboard
aws logs tail /ecs/twiggy-dashboard --follow --region us-east-1
```

### 4. Testar Endpoints

```bash
# API
curl https://twiggy-api.dev.twiggy.ai/health

# Shopify
curl https://twiggy-shopify.dev.twiggy.ai/health

# Dashboard
curl https://twiggy-dashboard.dev.twiggy.ai/health
```

## 🛠️ Ajustes e Manutenção

### Atualizar Configuração ECS

Edite os arquivos em `inputs/nonprod/`:

```bash
cd /home/rasputin/DNX/twiggy/infra/app-ecs

# Editar apps
vim inputs/nonprod/ecs-apps.yaml

# Aplicar mudanças
pulumi up
```

### Escalar Aplicações

Ajuste `desiredCount`, `autoscalingMin`, `autoscalingMax` no arquivo `ecs-apps.yaml`:

```yaml
appsWithALB:
  - name: "twiggy-api"
    desiredCount: "2"  # Era 1
    autoscalingMin: "2"  # Era 1
    autoscalingMax: "5"  # Era 3
```

Depois:
```bash
pulumi up
```

### Adicionar Variáveis de Ambiente

Atualize os secrets no Secrets Manager:

```bash
# Obter secret atual
aws secretsmanager get-secret-value \
  --secret-id /app/ecs/twiggy-api \
  --region us-east-1 \
  --query SecretString \
  --output text > /tmp/secret.json

# Editar e adicionar variáveis
vim /tmp/secret.json

# Atualizar secret
aws secretsmanager put-secret-value \
  --secret-id /app/ecs/twiggy-api \
  --secret-string file:///tmp/secret.json \
  --region us-east-1

# Forçar novo deployment para aplicar
aws ecs update-service \
  --cluster dev-apps-us-east-1 \
  --service twiggy-api \
  --force-new-deployment \
  --region us-east-1
```

## 🚨 Troubleshooting

### Tasks não iniciam

```bash
# Verificar eventos do serviço
aws ecs describe-services \
  --cluster dev-apps-us-east-1 \
  --services twiggy-api \
  --region us-east-1 \
  --query 'services[0].events[0:10]'

# Verificar logs de falha
aws logs tail /ecs/twiggy-api --since 30m --region us-east-1
```

Causas comuns:
- ❌ Secret não existe ou está vazio
- ❌ IAM role sem permissões
- ❌ Imagem Docker não encontrada no ECR
- ❌ Porta incorreta
- ❌ Security group bloqueando tráfego

### Health Check falhando

```bash
# Verificar health check config
aws elbv2 describe-target-groups \
  --region us-east-1 \
  --query 'TargetGroups[?TargetGroupName==`dev-apps-twiggy-api`].HealthCheckPath'
```

Causas comuns:
- ❌ Aplicação não respondendo na porta correta
- ❌ Health check path incorreto (ex: /health vs /health/)
- ❌ Aplicação demorando muito para iniciar (aumentar `healthCheckGracePeriod`)

### ALB retornando 503

```bash
# Verificar se há targets healthy
aws elbv2 describe-target-health \
  --target-group-arn <arn> \
  --region us-east-1
```

Causas comuns:
- ❌ Nenhuma task rodando
- ❌ Tasks unhealthy
- ❌ Security group bloqueando ALB → Tasks

## 📚 Recursos Adicionais

- **Pulumi Docs:** https://www.pulumi.com/docs/
- **AWS ECS:** https://docs.aws.amazon.com/ecs/
- **AWS ALB:** https://docs.aws.amazon.com/elasticloadbalancing/
- **DNX Oni Tool:** https://github.com/DNX-BR/oni

## 📞 Suporte

Para dúvidas ou problemas:
1. Verifique este guia
2. Consulte logs do Pulumi e AWS
3. Entre em contato com o time DNX Brasil
