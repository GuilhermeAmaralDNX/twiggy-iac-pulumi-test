# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Repository Overview

Pulumi-based Infrastructure-as-Code (IaC) repository for managing AWS cloud infrastructure across multiple accounts.

**Language:** Node.js/JavaScript
**Framework:** Pulumi 3.191.0
**AWS Provider:** 7.5.0
**Organization:** DNXBrasil (Portuguese-speaking team)

## Common Commands

### Stack Operations
```bash
# Navigate to module and install dependencies
cd infra/<module-name>
npm install

# Authenticate with Pulumi
pulumi login
# Or: export PULUMI_ACCESS_TOKEN=<token>

# Select stack (format: org/module/account)
pulumi stack select twiggy-org/<module>/<account>

# Preview and apply
pulumi preview
pulumi up

# View outputs
pulumi stack output
```

### Stack Naming Convention
Format: `twiggy-org/<module>/<account>`
Examples:
- `twiggy-org/aws-root/root`
- `twiggy-org/network/nonprod`
- `twiggy-org/app-ecs/nonprod`

## Architecture

### Module Deployment Order (Dependencies)
Modules must be deployed in strict order:

```
1. aws-root          → Organization, accounts, SSO, budgets
   ├─ 2. network     → VPCs, subnets, NAT, Route53
   ├─ 2. identity    → IAM roles, SAML/SSO
   └─ 2. utilities   → ECR, Backup, ACM certificates
       ├─ 3. audit      → CloudTrail, GuardDuty, Security Hub
       │   └─ 4. baseline  → Security Hub acceptance, Config rules
       └─ 3. vpn-pritunl → Pritunl VPN server
           └─ 4. app-ecs    → ECS, RDS, Redis, Lambda, etc.
```

### AWS Account Structure - Twiggy
| Profile | Account ID | Role | Purpose |
|---------|------------|------|---------|
| `twiggy` | 101439088956 (DNX) | vibe-admin | Base SAML (conta DNX) |
| `twiggy-root` | 440041991649 | DNXAccess | Organization management |
| `twiggy-nonprod` | 632185211638 | twiggyDNXAccess | Dev/staging workloads |
| `twiggy-prod` | 052433811639 | twiggyDNXAccess | Production workloads |
| `twiggy-services` | 520827482915 | twiggyDNXAccess | ECR, certificates, backups |
| `twiggy-audit` | 116099575322 | twiggyDNXAccess | CloudTrail, GuardDuty, Security Hub |

### AWS CLI Access - Login e Assume Role

**Fluxo de autenticação:**
1. SAML login via Google → Conta DNX (101439088956) com role `vibe-admin`
2. Assume role automático para contas Twiggy via `source_profile = twiggy`

**Login SAML (quando sessão expirar):**
```bash
saml2aws login -a twiggy --username=guilherme.amaral@dnxbrasil.com
```

**Usar os profiles:**
```bash
# Verificar identidade
aws sts get-caller-identity --profile twiggy-nonprod
aws sts get-caller-identity --profile twiggy-prod
aws sts get-caller-identity --profile twiggy-services

# Usar como default
export AWS_PROFILE=twiggy-nonprod

# Comandos com profile específico
aws ecs list-clusters --profile twiggy-nonprod
aws s3 ls --profile twiggy-services
```

**Arquivos de configuração:**
- `~/.saml2aws` - Profiles SAML2AWS
- `~/.aws/config` - AWS CLI profiles com assume role chain

### Network Architecture (3-Tier)
```
VPC
├── Public Subnet    → ALBs, NAT Gateways
├── Private Subnet   → ECS tasks, EC2, Lambda (NAT egress)
└── Secure Subnet    → RDS, Redis (isolated, no internet)
```

## Standard Module Structure

```
module-name/
├── index.js          # Main async entry point
├── conf.js           # Configuration loader
├── output.js         # Cross-stack references (StackReference)
├── package.json      # Dependencies
├── Pulumi.yaml       # Stack metadata
├── Pulumi.{account}.yaml  # Stack-specific config
├── inputs/
│   ├── nonprod/      # YAML resource definitions
│   ├── prod/
│   └── shared/
└── *.js              # Feature modules
```

## Key Patterns

### Configuration Loading (conf.js)
```javascript
const pulumi = require('@pulumi/pulumi');
const config = new pulumi.Config();
let configuration = config.requireObject('configuration');
module.exports = { configuration };
```

### Cross-Stack References (output.js)
```javascript
const stackRoot = new pulumi.StackReference(`${org}/aws-root/root`);
const accounts = await stackRoot.getOutputDetails('accounts');
```

### Dynamic Resource Queries (Never hardcode IDs)
```javascript
// Correct: Query by tags
const vpc = await aws.ec2.getVpc({
  filters: [{ name: 'tag:Name', values: [`${account}-VPC`] }]
});

// Wrong: Hardcoded ID
const vpc = await aws.ec2.getVpc({ id: 'vpc-12345678' });
```

### Conditional Resource Creation
```javascript
if (configuration.createECS) {
    ecs = await cluster.CreateCluster(...);
}
```

## App-ECS Module (Largest)

Configuration is YAML-driven in `inputs/{account}/`:
- **ecs-apps.yaml** - ECS applications (appsWithALB, appsWithoutALB, appsScheduler)
- **rds.yaml** - RDS instances/clusters
- **redis.yaml** - ElastiCache Redis
- **lambda.yaml** - Lambda functions
- **ssm.yaml** - SSM parameters
- **s3.yaml**, **dynamo.yaml**, **eventbridge.yaml**, etc.

## CI/CD Pipeline (GitHub Actions)

### Pipeline Trigger
A pipeline é disparada manualmente via GitHub UI (workflow_dispatch):

**Arquivo:** `.github/workflows/pulumi.yml`

| Input | Descrição | Valores |
|-------|-----------|---------|
| `module` | Módulo Pulumi a executar | `aws-root`, `network`, `identity`, `utilities`, `audit`, `baseline`, `vpn-pritunl`, `app-ecs`, `runners`, `runner-gitlab`, `pritunl-zero` |
| `environment` | Ambiente/conta AWS | `nonprod`, `prod`, `audit`, `services`, `root` |
| `command` | Comando Pulumi | `preview`, `up` |

### Como Executar
1. Acesse **Actions → Pulumi Infrastructure → Run workflow**
2. Selecione:
   - `module`: ex. `app-ecs`
   - `environment`: ex. `nonprod`
   - `command`: ex. `preview`
3. Clique em **Run workflow**

### GitHub Secrets (Configurar em Settings → Secrets → Actions)
```
PULUMI_ACCESS_TOKEN     # Token do Pulumi Cloud
```

### Account IDs (configurados no workflow)
```yaml
ACCOUNT_ROOT: "440041991649"
ACCOUNT_PROD: "052433811639"
ACCOUNT_NONPROD: "632185211638"
ACCOUNT_AUDIT: "116099575322"
ACCOUNT_SERVICES: "520827482915"
```

### Runner
Self-hosted runner na org `Twiggy-ai` com labels:
- `self-hosted`
- `aws`
- `shared`
- `linux`

### Authentication Flow
1. Runner EC2 tem Instance Profile com permissão para assume role
2. GitHub Action usa `aws-actions/configure-aws-credentials@v4`
3. Assume `InfraDeployAccess` role na conta alvo

### InfraDeployAccess Role Setup
Role criada em `aws-root/rolesAccount.js`. Se assume role falhar:
1. Verifique se InfraDeployAccess existe na conta alvo
2. Verifique trust policy inclui o EC2 instance profile do runner
3. Em aws-root config, verifique `extraTrustRelationshipInfraDeploy`

## Troubleshooting

### Stack Reference Errors
Ensure dependent stacks are deployed first in correct order (see deployment order above).

### VPC/Subnet Query Failures
Verify tags match expected pattern: `${account}-VPC`, `Scheme: public/private/secure`.

### Cross-Stack Output Issues
Use `await stackRef.getOutputDetails('name')` (not just `getOutput`) for resolved values.

### Role Assumption Failures
1. Verify InfraDeployAccess role exists in target account
2. Check trust policy includes the calling principal (CIDeploy user or EC2 role)
3. Verify CIDeploy user in shared account has `sts:AssumeRole` permission for `InfraDeployAccess`
4. In aws-root config, check `extraTrustRelationshipInfraDeploy` includes needed principals
