FROM pulumi/pulumi-nodejs:3.191.0

RUN apt-get update && \
    apt-get install -y unzip && \
    rm -rf /var/lib/apt/lists/

RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" && \
    unzip awscliv2.zip && \
    ./aws/install