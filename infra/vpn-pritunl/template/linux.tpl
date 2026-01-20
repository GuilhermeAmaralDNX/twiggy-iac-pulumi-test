#!/bin/bash

tee /etc/apt/sources.list.d/pritunl.list << EOF
deb http://repo.pritunl.com/stable/apt jammy main
EOF

# Import signing key from keyserver
apt-key adv --keyserver hkp://keyserver.ubuntu.com --recv 7568D9BB55FF9E5287D586017AE645C0CF8E292A
# Alternative import from download if keyserver offline
curl https://raw.githubusercontent.com/pritunl/pgp/master/pritunl_repo_pub.asc |  apt-key add -

tee /etc/apt/sources.list.d/mongodb-org-6.0.list << EOF
deb https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/6.0 multiverse
EOF

wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc |  apt-key add -

apt update -y
# apt --assume-yes upgrade

# WireGuard server support
apt -y install wireguard wireguard-tools

ufw disable

apt -y install pritunl mongodb-org


#MONGODB_URI_PROTO

tee /etc/pritunl.conf << EOF
{
    "debug": false,
    "bind_addr": "0.0.0.0",
    "port": 443,
    "log_path": "/var/log/pritunl.log",
    "temp_path": "/tmp/pritunl_%r",
    "local_address_interface": "auto",
    "mongodb_uri": "mongodb://localhost:27017/pritunl-server"
}
EOF

systemctl start mongod

systemctl start pritunl

systemctl enable mongod pritunl


pritunl set app.redirect_server false

pritunl set app.server_ssl true

pritunl set app.server_port 443

pritunl set app.www_path /usr/share/pritunl/www

pritunl set app.sso_cache false

pritunl set app.sso_client_cache false
#get password
apt install -y awscli

VPN_PASSWORD=$(pritunl default-password)

aws ssm put-parameter --name "pritunl-vpn-password"  --type "SecureString"  --value "$VPN_PASSWORD"  --overwrite --region VPN_REGION