import yaml
import os
from diagrams import Diagram, Cluster, Edge
from diagrams.aws.compute import ElasticContainerServiceService, ElasticContainerService, AutoScaling, EC2Instance, ElasticBeanstalkApplication, EC2, ElasticBeanstalk, ElasticKubernetesService
from diagrams.aws.network import ElbApplicationLoadBalancer, NATGateway
from diagrams.aws.database import DocumentdbMongodbCompatibility, RDS, ElasticacheForRedis, ElastiCache
from diagrams.aws.management import SystemsManager, SSM
from diagrams.aws.security import SecretsManager
from diagrams.aws.integration import SimpleQueueServiceSqs, SQS, SimpleNotificationServiceSns, SNS
from diagrams.aws.storage import SimpleStorageServiceS3, S3 
from diagrams.aws.security import IdentityAndAccessManagementIam
from diagrams.onprem.monitoring import Grafana, Prometheus
from diagrams.aws.management import Cloudwatch
from diagrams.aws.storage import ElasticFileSystemEFS
from diagrams.k8s.compute import Deployment
from diagrams.onprem.logging import Loki
from diagrams.onprem.gitops import Argocd
import sys

#cloud_service = "ecs"

# Diretório onde os arquivos YAML estão localizados
#yaml_directory = "./app-ecs/inputs/nonprod"  # Substitua pelo caminho do seu diretório

# Lista de arquivos YAML no diretório
#yaml_files = [file for file in os.listdir(yaml_directory) if file.endswith(".yaml")]

stack_reference = "nonprod"
cloud_service = sys.argv[1]
vpn_type = sys.argv[2]
if cloud_service in ["ECS","ECS-ARGOCD"]:
    stack_directory = "app-ecs"
else :
    stack_directory = "app-eks"


with open(f"./{stack_directory}/Pulumi.nonprod.yaml", "r") as file:
    data = yaml.safe_load(file)


    with Diagram(f"Ambiente AWS  {cloud_service} ", show=False, direction="TB"):
        with Cluster("Public Subnet",graph_attr={"bgcolor": "lightgreen"}):                    
            NATGateway("NAT")
            if cloud_service in ["ECS","ECS-ARGOCD"]:
                if data["config"]["app-ecs:configuration"]["albExternal"]:
                    lb_externo = ElbApplicationLoadBalancer("ALB Externo")
            else :
                lb_externo = ElbApplicationLoadBalancer("ALB Externo") 
            if vpn_type == "ZERO":
                vpn_ecs = EC2("EC2 VPN Pritunl" if vpn_type == "VPN" else "EC2 Pritunl Zero")

        with Cluster("Private Subnet"):
            if cloud_service in ["ECS","ECS-ARGOCD"]:
                    if data["config"]["app-ecs:configuration"]["albInternal"] or  cloud_service == "EKS":
                        lb_interno = ElbApplicationLoadBalancer("ALB Interno")     
            else :           
                lb_interno = ElbApplicationLoadBalancer("ALB Interno")   
            if vpn_type == "VPN":
                vpn_ecs = EC2("EC2 VPN Pritunl" if vpn_type == "VPN" else "EC2 Pritunl Zero")                
    
        with Cluster("Private Subnet"):
            with Cluster(f"Cluster {cloud_service}"):

                if  cloud_service in ["ECS","ECS-ARGOCD"]:
                    cluster = ElasticContainerService("Cluster ECS")
                else :
                    cluster = ElasticKubernetesService("Cluster EKS")

                if  cloud_service in ["ECS","ECS-ARGOCD"]:
                    with open(f"./{stack_directory}/inputs/{stack_reference}/ecs-apps.yaml", "r") as file:
                        data_apps = yaml.safe_load(file)
                        for item in data_apps["appsWithALB"]:
                            services = ElasticContainerServiceService(item["name"])
                            services - Edge(color="firebrick", style="dotted") - cluster
                            if item["alb"] == "external":
                                lb_externo >> Edge(color="gray", style="bold") >> services
                            else:
                                lb_interno >> Edge(color="gray", style="bold") >> services
                        for item in data_apps["appsWithouthALB"]:
                            services = ElasticContainerServiceService(item["name"])
                            services - Edge(color="firebrick", style="dotted") - cluster
                        for item in data_apps["appsScheduler"]:
                            services = ElasticContainerServiceService(item["name"])
                            services - Edge(color="firebrick", style="dotted") - cluster                        

                    grafana = Grafana("monitoring")   
                    lb_externo >> Edge(color="gray", style="bold") >> grafana

                if  cloud_service == "EKS":
                    with Cluster(f"kube-system"):
                        Deployment("AutoScale")
                        Deployment("External DNS")
                        Deployment("AWS Load Balancer Controller")
                    with Cluster(f"argocd"):
                        Argocd("Argocd")
                        Argocd("ArgoRollouts")
                    with Cluster(f"monitoring"):
                        Grafana("Grafana")
                        Prometheus("Prometheus")                        
                        Loki("Loki")                        



        if  cloud_service in ["ECS","ECS-ARGOCD"]:                    
            cloudw = Cloudwatch('metrics-logs') << grafana
               



        #    with Cluster("Private Subnet"):
        
        
        if  cloud_service in ["ECS","ECS-ARGOCD"]:  
            if data["config"]["app-ecs:configuration"]["ECSVpnAccess"]:
                cluster << Edge(color="firebrick", style="bold", label="Pritunl VPN") << vpn_ecs
        else :
            cluster << Edge(color="firebrick", style="bold", label="Pritunl VPN") << vpn_ecs

        with Cluster("Private Subnet"):
            with open(f"./{stack_directory}/inputs/{stack_reference}/ec2.yaml", "r") as file:
                data_instances = yaml.safe_load(file)
                for item in data_instances:
                   ec2_instance = EC2(item["name"])
                   if item["vpnAccess"]:
                       ec2_instance << Edge(color="firebrick", style="bold", label=" VPN Access") << vpn_ecs
                   if item["appsAccess"]:
                       ec2_instance << Edge(color="green", style="bold", label="Apps Access") << cluster   


        with Cluster("Secure Subnet",graph_attr={"bgcolor": "lightyellow"}):
            with open(f"./{stack_directory}/inputs/{stack_reference}/redis.yaml", "r") as file:
                data_instances = yaml.safe_load(file)
                for item in data_instances:
                   redis = ElastiCache(item["name"])
                   if item["vpnAccess"]:
                       redis << Edge(color="firebrick", style="bold", label=" VPN Access") << vpn_ecs
                   if item["appsAccess"]:
                       redis << Edge(color="green", style="bold", label="Apps Access") << cluster                                        

            with open(f"./{stack_directory}/inputs/{stack_reference}/docdb.yaml", "r") as file:
                data_instances = yaml.safe_load(file)
                for item in data_instances:
                   docdb = DocumentdbMongodbCompatibility(item["name"])
                   if item["vpnAccess"]:
                       docdb << Edge(color="firebrick", style="bold", label=" VPN Access") << vpn_ecs
                   if item["appsAccess"]:
                       docdb << Edge(color="green", style="bold", label="Apps Access") << cluster                                        


            with open(f"./{stack_directory}/inputs/{stack_reference}/rds.yaml", "r") as file:
                data_instances = yaml.safe_load(file)
                for item in data_instances["instance"]:
                   rds = RDS(item["name"])
                   if item["vpnAccess"]:
                       rds << Edge(color="firebrick", style="bold", label=" VPN Access") << vpn_ecs
                   if item["appsAccess"]:
                       rds << Edge(color="green", style="bold", label="Apps Access") << cluster        
                for item in data_instances["cluster"]:
                   rds_cluster = RDS(item["name"])
                   if item["vpnAccess"]:
                       rds_cluster << Edge(color="firebrick", style="bold", label=" VPN Access") << vpn_ecs
                   if item["ecsAccess"]:
                       rds_cluster << Edge(color="green", style="bold", label="Apps Access") << cluster    


            with open(f"./{stack_directory}/inputs/{stack_reference}/elasticbeanstalk.yaml", "r") as file:
                data_instances = yaml.safe_load(file)
                for item in data_instances:
                   elasticbeanstalk = ElasticBeanstalk(item["name"])
                   if item["vpnAccess"]:
                       elasticbeanstalk << Edge(color="firebrick", style="bold", label=" VPN Access") << vpn_ecs
                   if item["appsAccess"]:
                       elasticbeanstalk << Edge(color="green", style="bold", label="Apps Access") << cluster                                                                   

            efs = ElasticFileSystemEFS("EFS")
            efs << Edge(color="darkblue", style="bold", label="Apps Access") << cluster                                                                   


        with Cluster("Outros Recursos"):
            with open(f"./{stack_directory}/inputs/{stack_reference}/s3.yaml", "r") as file:
                data_instances = yaml.safe_load(file)
            if len(data_instances["listS3"]) > 0 :
                s3 = SimpleStorageServiceS3("S3")


            with open(f"./{stack_directory}/inputs/{stack_reference}/sns.yaml", "r") as file:
                data_instances = yaml.safe_load(file)
            if len(data_instances) > 0 :
                sns = SimpleNotificationServiceSns("SNS")            

            with open(f"./{stack_directory}/inputs/{stack_reference}/sqs.yaml", "r") as file:
                data_instances = yaml.safe_load(file)
            if len(data_instances["listSqs"]) > 0 :
                sqs = SimpleQueueServiceSqs ("SQS")                  

            with open(f"./{stack_directory}/inputs/{stack_reference}/ssm.yaml", "r") as file:
                data_instances = yaml.safe_load(file)
            if len(data_instances) > 0 :
                ssm = SSM("SSM")         

            with open(f"./{stack_directory}/inputs/{stack_reference}/secret-manager.yaml", "r") as file:
                data_instances = yaml.safe_load(file)
            if len(data_instances) > 0 :
                secret = SecretsManager("Secret Manager")

            with open(f"./{stack_directory}/inputs/{stack_reference}/iam.yaml", "r") as file:
                data_instances = yaml.safe_load(file)
            if len(data_instances) > 0 :
                secret = IdentityAndAccessManagementIam("IAM")           

            with open(f"./{stack_directory}/inputs/{stack_reference}/lb.yaml", "r") as file:
                data_instances = yaml.safe_load(file)
            if len(data_instances) > 0 :
                elb = ElbApplicationLoadBalancer("Load Balancer")                        

