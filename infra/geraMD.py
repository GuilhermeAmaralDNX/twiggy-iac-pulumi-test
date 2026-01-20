import os
import yaml
from jinja2 import Environment, FileSystemLoader
from jinja2 import Template
import json
import sys
################### Leitura do output de root #################################

CLOUD_SERVICE=sys.argv[1]
USE_GSUITE=sys.argv[2]
USE_GIT_TYPE=sys.argv[3]
VPN_TYPE=sys.argv[4]
MONITORING_ECS_TYPE=sys.argv[5]

if VPN_TYPE == "ZERO":
    printul_zero = "YES"
    printul_vpn = "NO"
elif VPN_TYPE == "VPN":
    printul_vpn = "YES"
    printul_zero = "NO"
else:     
    printul_vpn = "NO"
    printul_zero = "NO"    

if CLOUD_SERVICE in ["ECS","ECS-ARGOCD"]:
    stack_directory = "app-ecs"
else: 
    stack_directory = "app-eks"

stack_reference = "nonprod"    

# Pasta onde o arquivos JSON root está localizado
with open('./aws-root/root-output.json', 'r') as json_file:
    json_data = json.load(json_file)

# lista de contas do json
accounts = json_data['accounts']

# Listas para armazenar os emails, ids e nomes
emails = []
ids = []
names = []
orgname = json_data.get('orgName', 'Valor Padrão')

# loop através das contas do arquivo root para obter os emails, ids e nomes
for account in accounts:
    email = account['account']['email']
    id = account['account']['id']
    name = account['name']

    # Verifica o valor de nome para imprimir as informações de acordo com o ambiente
    if name == 'shared':
        name_shared = name
        email_shared = email
        id_shared = id

    elif name == 'audit':
        name_audit = name
        email_audit = email
        id_audit = id

    elif name == 'nonprod':
        name_nonprod = name
        email_nonprod = email
        id_nonprod = id

    elif name == 'prod':
        name_prod = name
        email_prod = email
        id_prod = id

    else:
        name_prod = None
    
    emails.append(email)
    ids.append(id)
    names.append(name)


################### Leitura dos outputs de network #################################

# Pasta onde os arquivos JSON estão localizados
json_folder = './network'

# Obtém uma lista de todos os arquivos JSON na pasta
json_files = [f for f in os.listdir(json_folder) if f.endswith('-output.json')]

# Loop através dos arquivos JSON na pasta
nonprod_publicIP = "-"
nonprod_cidr = "-"
nonprod_dominio = "-"
prod_publicIP = "-"
prod_cidr = "-"
prod_dominio = "-"
shared_publicIP = "-"
shared_cidr = "-"
shared_dominio = "-"

for json_file in json_files:
    with open(os.path.join(json_folder, json_file), 'r') as file:
        json_data = json.load(file)
        # Acessa as tags do bloco "vpc" e obtem o valor de "EnvName" dentro de "tagsAll" para identificar se é prod, nonpro, etc.
        vpc_tags = json_data.get('vpc', {}).get('tagsAll', {})
        env_name = vpc_tags.get('EnvName', '')


        # Acessa "publicIp" dentro de publicOutboundIps para obter o endereço publico
        public_outbound_ips = json_data.get('publicOutboundIps', [])
        public_ips_list = [outbound_ip.get('publicIp', '') for outbound_ip in public_outbound_ips]
        
        # Verifica se a lista public_outbound_ips está vazia ou não 
        if public_outbound_ips:
            primeiro_ip_publico = public_outbound_ips[0].get('publicIp', '')
        else:
            print("Não foi possível encontrar o valor de 'publicIp' dentro de 'publicOutboundIps'.")
        
        # Acessa o valor de "name" dentro de defaultDomain para obter o DNS
        domains = json_data.get("defaultDomain", [])
        name_dns = [domain.get('name', '') for domain in domains]

        # Verifica se a lista domains está vazia ou não 
        if domains:
            dominio = domains[0].get('name', '')
        else:
            print("Não foi possível encontrar o valor de 'name' dentro de 'domains'.")

        # Acessa o valor de cidrBlock dentro do bloco de VPC
        vpc_cidr_block = json_data.get('vpc', {}).get('cidrBlock', '')
        
        # Verifica o valor de EnvName e imprime os valores apropriados (apenas para teste)
        if env_name == 'prod':
            prod_publicIP = primeiro_ip_publico
            prod_cidr = vpc_cidr_block
            prod_dominio = dominio

        elif env_name == 'nonprod':
            nonprod_publicIP = primeiro_ip_publico
            nonprod_cidr = vpc_cidr_block
            nonprod_dominio = dominio

        elif env_name == 'shared':
            shared_publicIP = primeiro_ip_publico
            shared_cidr = vpc_cidr_block
            shared_dominio = dominio



####################################### Leitura dos Yamls ###########################################

# Diretório onde estão os arquivos YAML
diretorio = f'./{stack_directory}/inputs/{stack_reference}'

instancias_docdb = []
instancias_beanstalk = []
lb_info = []
instancias_beanstalk_types = []
redis_info = []
s3_info_list = []
sns_info = []
sqs_info = []
instance_list = []
cluster_list = []
instancias_ec2 = []
ssm_info = []
secrets_manager_info = []
iam_info = []
apps_with_alb_info = []
apps_without_alb_info = []
apps_scheduler_info = []
# Dicionário para armazenar informações
#instancias = {"ec2": [], "beanstalk": [], "docdb": [], "lb": [], "redis": [], "s3": [], "sns":[], "sqs":[], "rds":[], "ssm": [], "secret": [] }
arquivos_vazios = []

# Função para extrair informações de acordo com o nome do arquivo
def extrair_informacoes(nome_arquivo):
    with open(nome_arquivo, 'r') as arquivo:
        conteudo = yaml.load(arquivo, Loader=yaml.FullLoader)
        nome_arquivo = os.path.basename(nome_arquivo)
        if not conteudo:
            # Arquivo vazio, adicione apenas o nome à lista de arquivos vazios
            arquivos_vazios.append(nome_arquivo)

        elif 'ec2' in nome_arquivo:
            # Extrair informações para arquivos com "ec2" no nome
            for instancia in conteudo:
                ec2_info = {
                    "name": instancia.get("name", ""),
                    "ami": instancia.get("ami", ""),
                    "subnetType": instancia.get("subnetType", ""),
                    "instanceType": instancia.get("instanceType", ""),
                    "volumeSize": instancia.get("volumeSize", "")
                }
                instancias_ec2.append(ec2_info)

        elif 'beanstalk' in nome_arquivo:
            # Extrair informações para arquivos com "beanstalk" no nome
            for instancia in conteudo:
                beanstalk_info = {
                    "environment": instancia.get("environment", ""),
                    "name": instancia.get("name", ""),
                    "solutionStackName": instancia.get("solutionStackName", ""),
                    "volumeSize": instancia.get("volumeSize", "")
                }
                instancias_beanstalk.append(beanstalk_info)
                instance_types = instancia.get("instancesTypes", [])
                if instance_types:
                    beanstalk_info["instanceTypes"] = instance_types
            instancias_beanstalk_types.extend(instance_types)

        elif 'docdb' in nome_arquivo:
            # Extrair informações para arquivos com "docdb" no nome
            for instancia in conteudo:
                if 'instances' in instancia:
                    for subinstancia in instancia['instances']:
                        docdb_info = {
                            "name": instancia["name"],
                            "instanceName": subinstancia.get("name", ""),
                            "instanceClass": subinstancia.get("instanceClass", ""),
                            "engine": subinstancia.get("engine", "")
                        }
                        instancias_docdb.append(docdb_info)

        elif 'ecs-apps' in nome_arquivo:
            # Extrair informações para arquivos com "lb" no nome
            # print(conteudo)
            for apps_with_alb in conteudo["appsWithALB"]:
                apps_with_alb_description = {
                    "name": apps_with_alb.get("name", ""),
                    "alb": apps_with_alb.get("alb", ""),
                    "hostnames": apps_with_alb.get("hostnames", ""),
                    "launchType": apps_with_alb.get("launchType", ""),
                }
                apps_with_alb_info.append(apps_with_alb_description)

            for apps_without_alb in conteudo["appsWithouthALB"]:
                apps_without_alb_description = {
                    "name": apps_without_alb.get("name", ""),
                    "launchType": apps_without_alb.get("launchType", ""),
                }
                apps_without_alb_info.append(apps_without_alb_description)       

            for apps_scheduler in conteudo["appsScheduler"]:
                scheduler_description = {
                    "name": apps_scheduler.get("name", ""),
                    "launchType": apps_scheduler.get("launchType", ""),
                    "scheduleExpression": apps_scheduler.get("scheduleExpression", ""),
                }
                apps_scheduler_info.append(scheduler_description)                            

        elif 'lb' in nome_arquivo:
            # Extrair informações para arquivos com "lb" no nome
            for instancia in conteudo:
                lb_instance_info = {
                    "name": instancia.get("name", ""),
                    "loadBalancerType": instancia.get("loadBalancerType", ""),
                    "subnetType": instancia.get("subnetType", "")
                }
                lb_info.append(lb_instance_info)

        elif 'redis' in nome_arquivo:
            # Extrair informações para arquivos com "redis" no nome
            for instancia in conteudo:
                redis_instance_info = {
                    "name": instancia.get("name", ""),
                    "automaticFailoverEnabled": instancia.get("automaticFailoverEnabled", ""),
                    "multiAzEnabled": instancia.get("multiAzEnabled", ""),
                    "engineVersion": instancia.get("engineVersion", ""),
                    "nodeType": instancia.get("nodeType","")
                }
                redis_info.append(redis_instance_info)

        elif "s3" in nome_arquivo:
            # Extrair informações para arquivos com "s3" no nome
            if isinstance(conteudo, dict):
                if 'listS3' in conteudo and isinstance(conteudo['listS3'], list):
                    for item in conteudo['listS3']:
                        if isinstance(item, dict):
                            s3_info = {
                                "name": item.get("name", ""),
                                "acl": item.get("acl", "")
                            }
                            if 'customKMSPermission' in item and isinstance(item['customKMSPermission'], list) and not item['customKMSPermission']:
                                custom_kms_permissions = []
                                for permission in item['customKMSPermission']:
                                    permission_info = {
                                        "permission_data": permission.get("data", ""),
                                        "permission_type": permission.get("type", "")
                                    }
                                    custom_kms_permissions.append(permission_info)
                                s3_info["customKMSPermission"] = custom_kms_permissions

                            s3_info_list.append(s3_info)
        
        elif 'sns' in nome_arquivo:
            # Extrair informações para arquivos com "sns" no nome
            for sns in conteudo:
                sns_description = {
                    "name": sns.get("name", ""),
                    "subscriptions": len(sns.get("subscriptions", 0)),
                }
                sns_info.append(sns_description)

        elif 'ssm' in nome_arquivo:
            # Extrair informações para arquivos com "sns" no nome
            for ssm in conteudo:
                ssm_description = {
                    "name": ssm
                }
                ssm_info.append(ssm_description)

        elif 'iam' in nome_arquivo:
            # Extrair informações para arquivos com "sns" no nome
            for iam in conteudo:
                iam_description = {
                    "name": iam["name"]
                }
                iam_info.append(iam_description)                

        elif 'secret-manager' in nome_arquivo:
            # Extrair informações para arquivos com "sns" no nome
            for secret in conteudo:
                secret_description = {
                    "name": secret
                }
                secrets_manager_info.append(secret_description)

        elif 'sqs' in nome_arquivo:
            # Extrair informações para arquivos com "sqs" no nome
                for sqs in conteudo["listSqs"]:
                    sqs_instance_info = {
                        "name": sqs.get("name", ""),
                        "fifoQueue": sqs.get("fifoQueue", "")
                    }
                    sqs_info.append(sqs_instance_info)

        elif 'rds' in nome_arquivo:
            # Extrair informações para arquivos com "rds" no nome
            rds_info = {
                "instance": [],
                "cluster": []
            }
            if isinstance(conteudo, dict):
                # Extrair informações da lista "instance"
                if 'instance' in conteudo and isinstance(conteudo['instance'], list):
                    for instance_item in conteudo['instance']:
                        instance_info = {
                            "name": instance_item.get("name", ""),
                            "instanceClass": instance_item.get("instanceClass", ""),
                            "allocatedStorage": instance_item.get("allocatedStorage", ""),
                            "engine": instance_item.get("engine", ""),
                            "engineVersion": instance_item.get("engineVersion", "")
                        }
                        rds_info["instance"] = instance_list

                        rds_info["instance"].append(instance_info)
                
                # Extrair informações da lista "cluster"
                if 'cluster' in conteudo and isinstance(conteudo['cluster'], list):
                    for cluster_item in conteudo['cluster']:
                        if 'node_write' in cluster_item and isinstance(cluster_item['node_write'], dict):
                            cluster_info = {
                                "name": cluster_item['name'],
                                "instanceClass": cluster_item['node_write'].get("instanceClass", ""),
                                "engine": cluster_item['node_write'].get("engine", ""),
                                "engineVersion": cluster_item['node_write'].get("engineVersion", "")
                            }
                            rds_info["cluster"] = cluster_list
                            rds_info["cluster"].append(cluster_info)




# Percorra os arquivos no diretório
print(diretorio)
for arquivo in os.listdir(diretorio):
    if arquivo.endswith('.yaml'):
        nome_arquivo_completo = os.path.join(diretorio, arquivo)
        extrair_informacoes(nome_arquivo_completo)



# Dicionário com os valores para Jinja
jinja_data = {

    'CLOUD_SERVICE': CLOUD_SERVICE,
    'CLIENT_NAME': 'twiggy',
    'DATE': '25/05/2023',
    'GIT_TYPE': USE_GIT_TYPE,
    'GIT_LINK': '',
    'ACCOUNT_NAME_MASTER': '',
    'ACCOUNT_ID_MASTER': '',
    'DESCRIPTION_MASTER': '',
    'EMAIL_MASTER': '',
    'DESCRIPTION_SERVICES': 'Shared Services',
    'ACCOUNT_NAME_SERVICES': name_shared,
    'ACCOUNT_ID_SERVICES': id_shared,
    'EMAIL_SERVICES': email_shared,

    'DESCRIPTION_AUDIT': 'Conta Audit',
    'ACCOUNT_NAME_AUDIT': name_audit,
    'ACCOUNT_ID_AUDIT': id_audit,
    'EMAIL_AUDIT': email_audit,

    'DESCRIPTION_NONPROD': 'Conta nonprod',
    'ACCOUNT_NAME_NONPROD': name_nonprod,
    'ACCOUNT_ID_NONPROD': id_nonprod,
    'EMAIL_NONPROD': email_nonprod,

    'DESCRIPTION_PROD': 'Conta prod',
    'ACCOUNT_NAME_PROD': name_prod,
    'ACCOUNT_ID_PROD': id_prod,
    'EMAIL_PROD': email_prod,

    'SUBDOMAIN_NONPROD': nonprod_dominio,
    'SUBDOMAIN_PROD': prod_dominio,
    'SUBDOMAIN_SHARED': shared_dominio,
    
    'NAT_GATEWAY_CIDR_SERVICES': shared_cidr,
    'NAT_GATEWAY_CIDR_NONPROD': nonprod_cidr,
    'NAT_GATEWAY_CIDR_PROD': prod_cidr,

    'PUBLIC_IP_SERVICES': shared_publicIP,
    'PUBLIC_IP_NONPROD': nonprod_publicIP,
    'PUBLIC_IP_PROD': prod_publicIP,

    'RANCHER_URL_NONPROD': 'https://headlamp.' + nonprod_dominio,
    'RANCHER_URL_PROD': 'https://headlamp.' + prod_dominio,

    'CANARY_URL_NONPROD': 'https://canary-checker.' + nonprod_dominio,
    'CANARY_URL_PROD': 'https://canary-checker.' + prod_dominio,

    'ARGOCD_URL_NONPROD': 'https://argocd.' + nonprod_dominio,
    'ARGOCD_URL_PROD': 'https://argocd.' + prod_dominio,
    'GRAFANA_URL_NONPROD': 'https://grafana.' + nonprod_dominio,
    'GRAFANA_URL_PROD': 'https://grafana.' + prod_dominio,
    'VPN_URL_NONPROD': 'https://pritunl.' + nonprod_dominio,
    'VPN_URL_PROD': 'https://pritunl.' + prod_dominio,
    'SELF_HOSTED_GITLAB_URL_SHARED': 'https://gitlab.' + shared_dominio,

    'PRINTUL_VPN': printul_vpn,
    'PRINTUL_ZERO': printul_zero,
    'MONITORING_ECS_TYPE': MONITORING_ECS_TYPE
    
}


# Verifica o tipo de git e preencha o link de acordo
if jinja_data['GIT_TYPE'] == 'Gitlab':
    jinja_data['GIT_LINK'] = 'www.gitlab.com/organizacao/'
elif jinja_data['GIT_TYPE'] == 'Github':
    jinja_data['GIT_LINK'] = 'www.github.com/organizacao/'
    


# Configurar o ambiente do Jinja2 e carregar o template
env = Environment(loader=FileSystemLoader('.'))
template = env.get_template('template.md')

# Renderize o template com os dados e a lista de "ec2"
conteudo_renderizado = template.render(
    jinja_data, 
    ec2_data=instancias_ec2, 
    docdb_data=instancias_docdb, 
    beanstalk_data=instancias_beanstalk, 
    beanstalk_types=instancias_beanstalk_types, 
    lb_data=lb_info, 
    redis_data=redis_info, 
    s3_data=s3_info_list, 
    sns_data=sns_info, 
    sqs_data=sqs_info, 
    data_intance_rds=instance_list, 
    data_cluster_rds=cluster_list, 
    ssm_data=ssm_info, 
    secret_data=secrets_manager_info, 
    iam_data=iam_info,
    apps_with_alb_data=apps_with_alb_info,
    apps_without_alb_data=apps_without_alb_info,
    apps_scheduler_data=apps_scheduler_info,
    gsuite=USE_GSUITE
    )

# Salve o conteúdo renderizado em um arquivo Markdown
with open('README.md', 'w', encoding='utf-8') as arquivo:
    arquivo.write(conteudo_renderizado)
