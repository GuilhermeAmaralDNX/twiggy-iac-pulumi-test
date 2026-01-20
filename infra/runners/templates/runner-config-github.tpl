#!/bin/bash -e
apt-get update -y
apt-get install -y jq git unzip wget docker make pip ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
service docker start
add-apt-repository ppa:deadsnakes/ppa -y
apt-get update
apt-get install python3.12 -y
pip install setuptools
pip install semgrep
wget https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64 -O /usr/bin/yq &&\
    chmod +x /usr/bin/yq
curl -fsSL https://get.pulumi.com | sh
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
. .nvm/nvm.sh
nvm install v18.20.3
export PATH=$PATH:/.pulumi/bin:/.nvm/versions/node/v18.20.3/bin
echo "{{tokenpulumi}}" >> /tmp/token
docker run --rm --entrypoint  "" -v $(pwd):/app  public.ecr.aws/dnxbrasil/oni:3.2.0 cp /usr/bin/oni /app/oni
cp oni /usr/bin/oni
wget https://github.com/aquasecurity/trivy/releases/download/v0.44.0/trivy_0.44.0_Linux-64bit.tar.gz && tar -xvf trivy_0.44.0_Linux-64bit.tar.gz && mv trivy /usr/bin/ && rm -f trivy_0.44.0_Linux-64bit.tar.gz
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
./aws/install
rm -rf aws awscliv2.zip
TOKEN_REGISTER=$(curl -X POST -H "Accept: application/vnd.github+json" -H "Authorization: Bearer {{token}}" -H "X-GitHub-Api-Version: 2022-11-28"  https://api.github.com/orgs/{{github_org}}/actions/runners/registration-token | jq -r '.token')
mkdir actions-runner && cd actions-runner
curl -o actions-runner-linux-x64-2.316.0.tar.gz -L https://github.com/actions/runner/releases/download/v2.316.0/actions-runner-linux-x64-2.316.0.tar.gz
tar xzf ./actions-runner-linux-x64-2.316.0.tar.gz
RUNNER_ALLOW_RUNASROOT="1" ./config.sh --url https://github.com/{{github_org}} --labels "{{labels}}" --replace --name "{{account_name}}" --unattended --token $TOKEN_REGISTER || true
RUNNER_ALLOW_RUNASROOT="1" ./run.sh &