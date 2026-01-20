#!/bin/bash -e
docker container run -dt -v /tmp:/tmp -v /var/run/docker.sock:/var/run/docker.sock \
-v /var/lib/docker/containers:/var/lib/docker/containers:ro \
-e ACCOUNT_UUID={{account_uuid}}  \
-e RUNNER_UUID={{runner_uuid}} \
-e RUNTIME_PREREQUISITES_ENABLED=true \
-e OAUTH_CLIENT_ID={{oauth_client_id}} \
-e OAUTH_CLIENT_SECRET={{oauth_client_secret}} \
-e WORKING_DIRECTORY=/tmp \
--name runner-0b9a5dde-68a7-5a9f-8d83-542e96b6d932 docker-public.packages.atlassian.com/sox/atlassian/bitbucket-pipelines-runner:1