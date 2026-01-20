# Arquitetura DNX Foundation
## Introdução

Toda a infraestrutura implantada via **DNX Foundation** é disponibilizada como código, dividido por stacks. Cada stack tem seu pipeline, facilitando alterações e deploy de parâmetros e/ou personalizações.

Para o cliente **twiggy**, os códigos da Foundation encontram-se no repositório do **github** acessado através do endereço: .

Em uma visão macro de toda a infraestrutura configurada na AWS, a figura a seguir ilustra a organização das contas, VPCs e subnets, bem como  onde os serviços estão implantados

<p align="center">
  <img src="images/general.png" />
</p>


### repositórios de IaC

Abaixo segue uma breve descrição de cada repostorio de IaC:

- **aws-root**: responsável pela criação da organização e das contas;
- **audit**: responsável pela criação e configuração os serviços de auditoria e segurança, Cloudtrail, Security Hub e Guard Duty;
- **baseline**: responsável pelo aceite e configuração do Security Hub, Guard Duty como também a notificação destes eventos;
- **identity**: responsável pela criação e configuração de roles de acessos
- **network**: responsável pela criação e configuração das VPC,Subnets, ACL e Dominios do ambiente;
- **utilities**: responsável pela criação e configuração dos repositórios ECR, AWS Backup e certificados(ACM);
- **vpn-pritunl**: responsável pela criação e configuração da VPN Pritunl;

- **app-ecs**: responsável pela criação dos cluster ECS e aplicações, assim como outros recursos de workload e storage(EC2,RDS,REDIS,etc..)


### Estrutua de configuração das Stacks Pulumi

Todas as stack do pulumi, possuem um padrão de arquivo de configuração, seguindo este padrão:

> Pulumi.**ambiente**.yaml

<p align="center">
  <img src="images/stack-example-config.png" />
</p>


Neste arquivo, ha configurações basicas referente a cada stack. Também ha em algumas stacks um diretorio chamado **inputs/ambiente**, nele ha a definição de criação de recursos, por exemplo, instancias de RDS ou S3.

<p align="center">
  <img src="images/stack-inputs-config.png" />
</p>


### Contas

Foram criadas quatro contas  a partir da conta principal (Master)  para segregar os serviços na nuvem da AWS. São elas:

|AWS Account  | Account ID |Descrição
|--|--|--|
|  |  | |
| audit | 116099575322 | Conta Audit|
| shared | 520827482915 | Shared Services|
| nonprod | 632185211638 | Conta nonprod|
| prod | 052433811639 | Conta prod|

## Cobranças

Todos os serviços que rodam nas contas são sumarizados na conta **** (). É possível configurar os serviços para alertar, via Slack, Teams ou Google, quando os custos estão acima de um valor pré-determinado. A figura abaixo ilustra os componentes envolvidos neste processo:

<p align="center">
  <img src="images/billing.png" />
</p>


## SSO e Identidades
O gerenciamento dos acessos aos recursos, não importando a conta que está implantado, é todo controlado via **role**, com autenticação centralizada no IAM. Se necessário  poderá ser configurado o acesso a AWS pelo AWS IAM Identity Center, logo, os usuários que podem acessar os recursos na nuvem precisam ser permitidos e associados a determinados grupos, os quais são aceitos via Single Sign-On (SSO), através de federação SAML.

A Foundation define um conjunto de configurações do IAM (Identity and Access Management) nas contas da AWS para aplicar o conceito _least privilege_ e prover exatamente a _policy_ necessária para usuários e sistemas.

<p align="center">
  <img src="images/sso.png" />
</p>


## Domínios

Todos os nomes de domínio passam a ser identificados por subdomínios delegados ao serviço **Route53** da AWS e seguem o padrão mostrado na figura a seguir.

Os domínios DNS da conta de nonprod e prod tem um Certificado  gerenciado pelo **AWS Certificate Manager**  que é emitido conforme o padrão estipulado para os subdomínios.

| AWS Account | Subdomain |
|--|--|
| nonprod  | dev.twiggy.ai |
| prod  | - |
|    shared   |   -    |

<p align="center">
  <img src="images/dns.png" />
</p>

## Rede

As VPCs dos ambientes produtivo, não-produtivo e shared-services são separadas, e cada uma possui três camadas de subnets, conforme apresentado na figura a seguir.

<p align="center">
  <img src="images/network.png" />
</p>



A saída de Internet é provisionada a partir do serviço **AWS NAT Gateway** que permite a comunicação entre a Internet e os recursos que estão na subnet privada.  Para esses três ambientes foi disponibilizado 01 NAT Gateway a partir de 01 zona de disponibilidade (AZ).

A tabela a seguir mostra as faixas de endereços IPs locais para cada conta, bem como a quantidade de NAT Gateways:

| AWS Account | CIDR | NAT Gateway |
|--|--|--|
| shared | - | Quantidade: 1 |
| nonprod | 10.47.0.0/16 | Quantidade: 1 |
| prod | -   | Quantidade: 1 |

E na próxima tabela estão listados os endereços IPs públicos de saída que estão alocados em cada ambiente:

| AWS Account | Public IP |
|--|--|
| shared| - |
| nonprod| 34.193.144.152 |
| prod| -|

## Subnets

Cada VPC possui subnets criadas para gerenciar o tráfego de rede internamente e aplicar uma camada robusta de segurança usando os conceitos de defesa com profundidade.

Somente a subnet privada tem acesso a subnet pública e a subnet segura. A subnet pública **não** acessa a subnet segura. A comunicação entre subnets é controlada por regras de rotas e NACLs (Networking Access Control List). Esta implementação tem foco em segurança e por regra nega tráfegos não autorizados entre subnets.

| **Subnet Layer** |  **Description**|
|--|--|
| Public | Esta camada é de acesso público, tipicamente todos os recursos aqui tem um endpoint público. AWS Load Balancers e AWS NAT Gateways são implantados nesta camada. |
| Private | Subnets privadas não são de acesso público, apenas as subnets pública e segura podem acessar esta camada. Todas as requisições de saída são roteadas por NATs implantados na camada pública. Os recursos de aplicação devem ser implantados nesta camada. |
| Secure | As subnets seguras não são publicamente acessíveis, é acessível apenas pela subnet privada e é a camada ideal para os serviços de armazenamento. |

<p align="center">
  <img src="images/nacl.png" />
</p>




## VPN Pritunl

A **DNX Foundation** requer uma conexão VPN (Virtual Private Network) para permitir acesso a todas as camadas de rede.

Para acessar os recursos que não têm acesso público é disponibilizado um serviço de VPN através do servidor **Printunl** implantado nas contas do ambiente produtivo e não-produtivo, o qual possui roteamento entre todas as subnets.

A conexão com o servidor VPN requer chaves individuais e MFA (Multi Factor Authentication). A figura a seguir apresenta detalhes da topologia da VPN.

<p align="center">
  <img src="images/vpn.png" />
</p>

 


 


<p align="center">
  <img src="images/vpn-zero.png" />
</p>

  


## Elastisc Container Service (ECS)


A infraestrutura de container disponibilizada utiliza o Elastic Container Service(ECS), no qual os nodes do cluster são dispostos em zonas de disponibilidade, com autoscale implementado. 
O acesso às aplicações do cluster se dá via Load Balance do tipo application, que é implantado na subnet pública, que faz acesso aos serviços na subnet privada, onde os nodes do cluster foram implantados. Os acessos via load balancer são seguros via certificados, que são gerados via ACM para cada conta. 
Os Nodes do cluster são do tipo spot disponibilizados inicialmente, porém outros podem ser adicionados posteriormente para caso de ondemand.

<p align="center">
  <img src="images/ecs.png" />
</p>


 

# Otimização de custos

A otimização de custos, envolve a utilização de instâncias SPOTs na disponibilização das máquinas do cluster ECS ou EKS, que podem reduzir os custos em até 70%. É utilizada também a estratégia de desligar recursos fora do horário de trabalho do cliente, através de uma scheduler.

<p align="center">
  <img src="images/cost.png" />
</p>


Como todo o ambiente é provisionado com infraestrutura como código(IaC), é possível destruir e criar o ambiente em alguns minutos, esta ideia é útil para casos de alguns recursos que não podem ser parados, é apenas destruídos, a exemplo, o Elasticache(Redis).

# Pipeline de Infraestrutura

A imagem abaixo apresenta o workflow do pipeline de infraestrutura para cada stack/repositório dos projetos  no Git do cliente.


<p align="center">
  <img src="images/ci-cd-pulumi.drawio.png" />
</p>




## Github Actions

#### Arquivo infrastructure.yaml
```yaml
on:
name: Pulumi action

on:
  workflow_dispatch:
    inputs:
      environment:
        required: true
        type: choice
        description: "Select environment"
        options:
          - nonprod
          - prod
          - audit
          - shared

      directory:
        required: true
        type: choice
        description: "Select directory"
        options:
          - audit
          - identity
          - baseline
          - network
          - utilities
          - vpn-pritunl
          - pritunl-zero
          - app-ecs

      commands:
        required: true
        type: choice
        description: "Pulumi command"
        options:
          - preview  --diff
          - up
 
env:
  ACCOUNT_PROD: "079910999382"
  ACCOUNT_NONPROD: "138062249233" 
  ACCOUNT_AUDIT: "049229311499"
  ACCOUNT_SERVICE: "298685518555"

jobs:
  iac-action:
    runs-on: ubuntu-latest

    steps:
      - name: Check out the repo
        uses: actions/checkout@v4
        with:
          ref: main

      - name: Set AWS Account ID based on environment
        id: account
        run: |
          case "${{ inputs.environment }}" in
            prod)
              echo "ACCOUNT_ID=${ACCOUNT_PROD}" >> $GITHUB_ENV ;;
            nonprod)
              echo "ACCOUNT_ID=${ACCOUNT_NONPROD}" >> $GITHUB_ENV ;;
            audit)
              echo "ACCOUNT_ID=${ACCOUNT_AUDIT}" >> $GITHUB_ENV ;;
            services)
              echo "ACCOUNT_ID=${ACCOUNT_SERVICE}" >> $GITHUB_ENV ;;
          esac

      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID_TMP }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY_TMP }}
          aws-region: ${{ secrets.AWS_REGION_TMP }}
          role-to-assume: arn:aws:iam::${{ env.ACCOUNT_ID }}:role/InfraDeployAccess
          role-session-name: pulumi-${{ inputs.environment }}

      - name: Install packages
        working-directory: ${{ inputs.directory }}
        run: npm install

      - name: Run Pulumi
        uses: pulumi/actions@v6
        with:
          command: ${{ inputs.commands }}
          stack-name: ${{ inputs.environment }}
          work-dir: ${{ inputs.directory }}
        env:
          PULUMI_ACCESS_TOKEN: ${{ secrets.PULUMI_ACCESS_TOKEN }}

```


O arquivo "action.yaml" permite executar o pipeline do Pulumi, com as ações de **preview** e **up**. A ação pode ser acessada através da pagina do projeto do Github:

<p align="center">
  <img src="images/github-action-pulumi.png" />
</p>

Ao clicar em Run Workflow, sera necessario escolher qual stack do pulumi deseja aplicar, ambiente e comando.
  




# Pipeline de Aplicação






A imagem abaixo apresenta o workflow do pipeline para as aplicações ECS.

<p align="center">
  <img src="images/ecs-deploy.png" />
</p>
  
A pipeline de aplicação contém os seguintes passos:

  - Teste de aplicação (opcional, isso é caso o cliente ja possua);
  - Build da imagem da aplicação;
  - Scans de seguração que inclui:
      - **Semgrep**: é uma ferramenta SAST(Static Application Security Testing) para análise de codigo;
      - **Trivy**: é uma ferramenta para análise de vulnerabilidade, que contém scans de:
              - Container image
              - FileSystem
              - Git Repository
  - Push da imagem para o repositório de imagens no ECR da conta shared
  - Deploy da aplicação no ECS



TODO: INSERIR EXEMPLO


### Github action 





Para o deploy do ECS, é utilizada a estratégia Blue/Green, que disponibiliza uma url temporária para testar a aplicação, e caso esta esteja respondendo de maneira correta, é realizada a troca para a nova versão

<p align="center">
  <img src="images/bg-ecs.png" />
</p>








# Monitoramento ECS




O monitoramento do ambiente ECS utiliza as métricas e logs disponível no Cloudwatch, onde a visualização é através do Grafana:

- **Nonprod:** https://grafana.dev.twiggy.ai
- **Prod:** https://grafana.-

Alguns Dashboard são fornecidos para acompanhar o ambiente, que são:

- **ECS V2**: métricas referentes as aplicações ecs(memoria, cpu, network);
- **AWS ELB**: métricas relacionadas aos request para a aplicação;
- **CloudWatch Logs**: logs das aplicações e cloudtrail, guardduty e securityhub;
- **Amazon RDS**: métricas relacionadas aos bancos de dados;
- **Amazon EC2**: métricas relacioandas as instancias ec2(cpu, memori, disk)

<p align="center">
  <img src="images/grafana-api.png" />
</p>



# Alertas ECS
Alguns alertas básicos são configurados no grafana, o endpoint de notificação fica a cargo de decisão do cliente, os alertas são:

- **Uso de CPU > 90%**
- **Uso de Memoria > 90%**
- **Aplicações Pendentes por mais de 5 min**

<p align="center">
  <img src="images/alertas.png" />
</p>




# Informações dos recursos provisionados



### Apps ECS com Load Balancer <img src="https://github.com/awslabs/aws-icons-for-plantuml/raw/main/dist/Containers/ElasticContainerService.png?raw=true" width="32" height="32">

|Nome | Tipo de ALB| Hostnames   | Launch Type |
 |:-------:| :-------:|:-------:|:-------:|
 | twiggy-api | external  | ['twiggy-api.dev.twiggy.ai']   |EC2  |
 | twiggy-shopify | external  | ['twiggy-shopify.dev.twiggy.ai']   |EC2  |
 | temporal | internal  | ['temporal.dev.twiggy.ai']   |EC2  |
 | temporal-ui | internal  | ['temporal-ui.dev.twiggy.ai']   |EC2  |





### Apps ECS sem Load Balancer(Worker) <img src="https://github.com/awslabs/aws-icons-for-plantuml/raw/main/dist/Containers/ElasticContainerService.png?raw=true" width="32" height="32">

|Nome | Launch Type |
 |:-------:| :-------:|
 | twiggy-worker |EC2  |
 | twiggy-yolo |EC2  |
 | twiggy-extract |EC2  |








































#### Cluster(s) RDS <img src="https://github.com/awslabs/aws-icons-for-plantuml/raw/main/dist/Database/RDS.png?raw=true" width="32" height="32">

| Nome | Classe  | Engine | Engine Version   |
|:---------: |:-------:| :-------:|:-------:|
 | twiggy-stg-cluster |db.serverless| aurora-postgresql  | 15.12 |





















### Secret Manager <img src="https://github.com/awslabs/aws-icons-for-plantuml/blob/main/dist/SecurityIdentityCompliance/SecretsManager.png?raw=true" width="32" height="32">

| Nome  |
|:---------: |
 |/app/ecs/twiggy-api|
 |/app/ecs/twiggy-worker|
 |/app/ecs/twiggy-shopify|
 |/app/ecs/twiggy-dashboard|
 |/app/ecs/temporal|
 |/app/ecs/temporal-ui|







# Diagrama da infraestrutura



<p align="center">
  <img src="ambiente_aws_ecs.png" />
</p>


# SSO Ferramentas ECS

Alguns ferramentas implementadas permitem que a autenticação seja delegada a um terceiro, que pode ser GSuite ou Azure Active Directory por exemplo. Abaixo segue os link da documentação de cada ferramenta:

### Grafana

https://grafana.com/docs/grafana/latest/setup-grafana/configure-security/configure-authentication/







# SSO GSuite AWS  _

## Configuração

Pré-requisitos:

-   Acesso administrativo ao GSuite
    

3.  Logar com uma conta com perfil de administrador no GSuite: [https://admin.google.com](https://admin.google.com/)
    
4.  Acessar no menu lateral esquerdo **Diretório** e em seguida clicar em **Usuários**.
    
5.  Na tela seguinte clique em **Mais opções** e em seguida **Gerenciar atributos personalizados**.
    

<p align="center">
  <img src="images/gsuite01.png" />
</p>

6.  Clicar em **Adicionar Atributo Personalizado**.
    

<p align="center">
  <img src="images/gsuite02.png" />
</p>

7.  Definir a categoria **AWS SAML,** adicionar os seguintes atributos e salvar conforme imagem:
    
	1.  Nome: IAM Role
        
	2.  Tipo: Texto
        
	3.  Número de valores: Valores múltiplos

	4.  Nome: SessionDuration
    
	5.  Tipo: Número inteiro
    
	6.  Número de valores: Valor único  
      
      
    

<p align="center">
  <img src="images/gsuite03.png" />
</p>

  

8.  Acessar no menu lateral esquerdo **Apps** e em seguida clicar em **Apps da Web e para dispositivos móveis**.
    

<p align="center">
  <img src="images/gsuite04.png" />
</p>

9.  Na tela seguinte clique em **Adicionar App** e em seguida em "Pesquisar  **apps".**
    

<p align="center">
  <img src="images/gsuite05.png" />
</p>

10.  Pesquisar por “Amazon Web Services” e selecionar conforme a tela abaixo.
    

<p align="center">
  <img src="images/gsuite06.png" />
</p>

11.  Na tela seguinte clicar em **FAZER DOWNLOAD DOS METADADOS**. **Será necessário enviar esse arquivo para a DNX Brasil**. Em seguida, clique em **CONTINUAR**.
    

<p align="center">
  <img src="images/gsuite07.png" />
</p>

12.  Na tela seguinte não precisa modificar os campos. Apenas clicar em **CONTINUAR**.
    

<p align="center">
  <img src="images/gsuite08.png" />
</p>

13.  Na tela seguinte realizar o mapeamento dos atributos de acordo com os campos personalizados criados anteriormente. Mapear conforme a imagem abaixo e finalizar em CONCLUIR.
    

<p align="center">
  <img src="images/gsuite09.png" />
</p>
  
  

14.  Após finalizada a adição do aplicativo é necessário ativá-lo para permitir o acesso dos usuários. Ativar conforme a figura abaixo.
    

<p align="center">
  <img src="images/gsuite10.png" />
</p>
  
  

#   
  

# Roles GSuite_

## Configuração

Pré-requisitos:

-   Acesso administrativo ao GSuite
    

  
  

Para dar permissões aos usuários GSuite nas contas AWS, basta adicionar as respectivas roles listadas abaixo nos atributos dos usuários GSuite seguindo os passos a seguir:

  
  

1.  Logar com uma conta com perfil de administrador no Gsuite: [https://admin.google.com](https://admin.google.com/)
    
2.  Acessar no menu lateral esquerdo **Diretório** e em seguida clicar em **Usuários**.
    
3.  Clicar no usuário que deseja adicionar a role.
    
4.  Na tela do usuário clique em **Informações do usuário** para expandir.
    
5.  Editar a seção **AWS SAML** e informar a role desejada no campo **IAM Role**. Um usuário pode ter múltiplas roles, basta adicionar as roles em linhas separadas.
    
6.  No campo **SessionDuration** informe a duração da sessão em segundos, valor padrão **43200**.
    

O preenchimento dos campos deverá ficar assim, respeitando os valores para IAM Role informados nas próximas páginas:

  

<p align="center">
  <img src="images/gsuite11.png" />
</p>

  

##   
  

## Conta Shared-Services

IAM Roles com acesso a conta **shared** (serviços – ID: **520827482915**)

  
  

AdministratorAccess

    arn:aws:iam::520827482915:role/AdministratorAccess,arn:aws:iam::520827482915:saml-provider/twiggy-sso

  

ViewOnlyAccess

    arn:aws:iam::520827482915:role/ViewOnlyAccess,arn:aws:iam::520827482915:saml-provider/twiggy-sso

## Conta Nonprod

IAM Roles com acesso a conta **nonprod** (não produtiva – ID: **632185211638**)

  

AdministratorAccess

    arn:aws:iam::632185211638:role/AdministratorAccess,arn:aws:iam::632185211638:saml-provider/twiggy-sso

  

DatabaseAdministrator

    arn:aws:iam::632185211638:role/DatabaseAdministrator,arn:aws:iam::632185211638:saml-provider/twiggy-sso

  

DataScientist

    arn:aws:iam::632185211638:role/DataScientist,arn:aws:iam::632185211638:saml-provider/twiggy-sso

  

NetworkAdministrator

    arn:aws:iam::632185211638:role/NetworkAdministrator,arn:aws:iam::632185211638:saml-provider/twiggy-sso

  

PowerUserAccess

    arn:aws:iam::632185211638:role/PowerUserAccess,arn:aws:iam::632185211638:saml-provider/twiggy-sso

  

SecurityAudit

    arn:aws:iam::632185211638:role/SecurityAudit,arn:aws:iam::632185211638:saml-provider/twiggy-sso

  

SupportUser

    arn:aws:iam::632185211638:role/SupportUser,arn:aws:iam::632185211638:saml-provider/twiggy-sso

  

SystemAdministrator

    arn:aws:iam::632185211638:role/SystemAdministrator,arn:aws:iam::632185211638:saml-provider/twiggy-sso

  

ViewOnlyAccess

    arn:aws:iam::632185211638:role/ViewOnlyAccess,arn:aws:iam::632185211638:saml-provider/twiggy-sso

## Conta Prod

IAM Roles com acesso a conta **prod** (produtiva – ID: **052433811639**)

  
  

AdministratorAccess

    arn:aws:iam::052433811639:role/AdministratorAccess,arn:aws:iam::052433811639:saml-provider/twiggy-sso

  

DatabaseAdministrator

    arn:aws:iam::052433811639:role/DatabaseAdministrator,arn:aws:iam::052433811639:saml-provider/twiggy-sso

  

DataScientist

    arn:aws:iam::052433811639:role/DataScientist,arn:aws:iam::052433811639:saml-provider/twiggy-sso

  

NetworkAdministrator

    arn:aws:iam::052433811639:role/NetworkAdministrator,arn:aws:iam::052433811639:saml-provider/twiggy-sso

  

PowerUserAccess

    arn:aws:iam::052433811639:role/PowerUserAccess,arn:aws:iam::052433811639:saml-provider/twiggy-sso

  

SecurityAudit

    arn:aws:iam::052433811639:role/SecurityAudit,arn:aws:iam::052433811639:saml-provider/twiggy-sso

  

SupportUser

    arn:aws:iam::052433811639:role/SupportUser,arn:aws:iam::052433811639:saml-provider/twiggy-sso

  

SystemAdministrator

    arn:aws:iam::052433811639:role/SystemAdministrator,arn:aws:iam::052433811639:saml-provider/twiggy-sso

  

ViewOnlyAccess

    arn:aws:iam::052433811639:role/ViewOnlyAccess,arn:aws:iam::052433811639:saml-provider/twiggy-sso

  

  

## Testando o Acesso SSO

1.  Logar com sua conta de e-mail no Gsuite.
    
2.  Clicar no botão de listar app.
    
3.  Rolar até encontrar o ícone do Amazon Web Services e clicar nele.
    

<p align="center">
  <img src="images/gsuite12.png" />
</p>

  
  

4.  Escolher a role que deseja logar e clicar em Sign In.
    

<p align="center">
  <img src="images/gsuite13.png" />
</p>







# Criação de Usuário Pritunl VPN

### Obtendo a senha padrão do Administrador
Após a criação da EC2 com a VPN do Pritunl, é necessário se conectar à máquina e executar os seguintes comandos para obter a senha padrão do Administrador da VPN ou acessar o SSM Parameter para recupera-la:

```
sudo su - 
pritunl default-password
```

Em seguida, acesse a URL da VPN (normalmente pritunl.ambiente.seudominio.com.br) e faça login com as credenciais obtidas anteriormente. 
Um pop-up solicitando o setup inicial irá aparecer. Insira o usuário padrão do pritunl e certifique-se de mudar o endereço público da VPN para a URL usada para acessá-la. Após deixar a configuração conforme mostrado na figura, clique em _Save_.

<p align="center">
  <img src="images/pritunl-01.png" />
</p>



### Criando uma organização e um servidor Pritunl

Para utilizar a VPN, é necessário criar uma organização e um servidor. 
**Para criar uma organização**, clique em Users no menu superior e em seguida clique em _Add Organization_.

<p align="center">
  <img src="images/pritunl-02.png" />
</p>


Entre com o nome da organização desejado e clique em Add.

<p align="center">
  <img src="images/pritunl-03.png" />
</p>


Criada a organização, vamos **criar o servidor da VPN**. No menu superior, clique em Servers e em seguida _Add Server_.

<p align="center">
  <img src="images/pritunl-04.png" />
</p>



  Insira o nome do servidor, troque a porta para 1194 com o protocolo TCP, ative o Google Authenticator e clique em _Add_, conforme mostra a imagem abaixo. Os demais campos ficarão com o valor padrão.

<p align="center">
  <img src="images/pritunl-05.png" />
</p>


Feito isso, devemos attachar a organização no servidor criado. Para tal, clique em _Attach Organization_, ainda na página dos Servidores.

<p align="center">
  <img src="images/pritunl-06.png" />
</p>



Selecione a organização e o servidor criados e clique em _Attach_.

<p align="center">
  <img src="images/pritunl-07.png" />
</p>



Em seguida, start o servidor clicando em _Start Server_.

<p align="center">
  <img src="images/pritunl-08.png" />
</p>



### Gerenciando de usuários VPN Pritunl
Para criar um usuário, clique em _Add User_ na mesma página _(Users)_ onde foi criada a organização.

<p align="center">
  <img src="images/pritunl-09.png" />
</p>




Insira o nome de usuário e selecione a organização à qual o usuário pertence. O e-mail pode ser deixado em branco. No campo do Pin, insira um valor de no mínimo 6 dígitos. Esse valor será solicitado toda vez que o usuário se conectar na VPN, e portanto deve ser informado ao dono do usuário criado.

<p align="center">
  <img src="images/pritunl-10.png" />
</p>



Após a criação, devem ser enviados, além do Pin, o QR Code (MFA) e o arquivo .ovpn necessários para a conexão com a VPN para o respectivo usuário. Para tal, clique no segundo ícone do lado direito do nome do usuário. 

<p align="center">
  <img src="images/pritunl-10-1.png" />
</p>



 Um pop-up irá abrir com 4 opções de link. Selecione o terceira e envie para o usuário.

<p align="center">
  <img src="images/pritunl-13.png" />
</p>



  Ao abrir a página, o usuário deverá scannear o QR Code com o aplicativo autenticador de preferência para habilitar o MFA, e depois clicar em _Show More_ no canto inferior.

<p align="center">
  <img src="images/pritunl-14.png" />
</p>



Copie a URI disponibilizada em Profile URI Link para ser adicionada ao aplicativo após a instalação. O próximo passo é clicar em Download Client e selecionar seu respectivo sistema operacional para baixar o cliente do Pritunl, ou acesse o link abaixo para fazer o download.

Pritunl Client - Open Source OpenVPN Client
https://client.pritunl.com/#install

Caso deseje remover um usuário, acesse a página de Users, selecione o usuário e clique em Delete Selected.

<p align="center">
  <img src="images/pritunl-15.png" />
</p>




## Utilização

Com a URI em mãos.  

<p align="center">
  <img src="images/pritunl-16.png" />
</p>



Inicie o aplicativo Pritunl Client e selecione a opção Import.

<p align="center">
  <img src="images/pritunl-17.png" />
</p>



Em seguida, cole no campo Profile URI o link copiado no step acima e selecione a opção “Import”.

<p align="center">
  <img src="images/pritunl-18.png" />
</p>



Após importar, seu usuário será adicionado ao aplicativo e você terá acesso a VPN selecionando a opção “Conectar”. Será solicitado o código MFA que está em seu aplicativo autenticador. 

<p align="center">
  <img src="images/pritunl-19.png" />
</p>


# Ativação do MFA nas Contas da AWS
### Configuração
1. Primeiramente, precisamos obter acesso root à cada conta. Para isso, deve-se acessar a página de Login no Console da AWS. https://aws.amazon.com/console/
2. Escolher entrar com “Root user” ou “Usuário root” e digitar o e-mail associado à cada conta criada
3. Clicar em “Next” ou “Próximo”.
<p align="center">
  <img src="images/mfa01.png" />
</p>
4. Digitar o captcha e clicar em “Submit” ou “Enviar”.
<p align="center">
  <img src="images/mfa02.png" />
</p>
5. Clicar em “Forgot password?” ou “Esqueceu a senha?”.
<p align="center">
  <img src="images/mfa03.png" />
</p>
6. Verificar a caixa de entrada do e-mail utilizado. Clicar no link para redefinição da senha.
7. Digitar nova senha e confirmar. Clicar em “Reset password” ou “Redefinir senha”.

<p align="center">
  <img src="images/mfa04.png" />
</p>

8. Voltar à página de Login e entrar na conta utilizando sua nova senha.
<p align="center">
  <img src="images/mfa05.png" />
</p>
9. Após autenticar na conta, clicar no nome da mesma, no canto superior direito, e em seguida, clicar em “My Security Credentials” ou “Minhas Credenciais de Segurança”.
<p align="center">
  <img src="images/mfa06.png" />
</p>

10. Clicar em “Multi-factor authentication (MFA)” ou “Autenticação multifator (MFA)”. Em seguida clicar em “Activate MFA” ou “Ativar MFA”.
<p align="center">
  <img src="images/mfa07.png" />
</p>
11. Selecionar “Virtual MFA device” ou “Dispositivo MFA virtual”. E clicar em “Continue”.
<p align="center">
  <img src="images/mfa08.png" />
</p>


12. Instale em seu dispositivo móvel um aplicativo compatível para autentição em duas etapas. Por exemplo: Google Authenticator ou Authy (*Recomendado, pois tem a opção de recuperação se trocar o aparelho).


13. Clicar em “Show QR Code” e utilizar o aplicativo para ler o código QR.

<p align="center">
  <img src="images/mfa09.png" />
</p>


14. O aplicativo reconhecerá o QR Code e mostrará um código temporário para autenticação. Digite dois códigos consecutivos nos campos MFA code 1 e MFA code 2.

<p align="center">
  <img src="images/mfa10.png" />
</p>


15. Por fim, clicar em “Assign MFA” ou “Atribuir MFA”.

<p align="center">
  <img src="images/mfa11.png" />
</p>

16. Pronto! A partir de agora, será necessário acesso ao aplicativo mobile para realizar Login na conta usando MFA.



