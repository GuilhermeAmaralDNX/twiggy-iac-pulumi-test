const aws = require("@pulumi/aws");
const pulumi = require('@pulumi/pulumi');

async function createEvent(event) {

  const createRole = new aws.iam.Role(`${event.name}-event-role`, {
    name: `${event.name}-event-role`,
    assumeRolePolicy: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Action: "sts:AssumeRole",
          Principal: {
            Service: "events.amazonaws.com",
          },
          Effect: "Allow",
          Sid: "",
        },
      ],
    }),
  });

  let createPolicy;
  if (event.policy)
    createPolicy = new aws.iam.Policy(`${event.name}-policy`, {
      name: `${event.name}-policy`,
      description: "Policy to allow EventBridge",
      policy: JSON.stringify(event.policy),
    });

  let attachPolicy;
  if (event.policy)
    attachPolicy = new aws.iam.RolePolicyAttachment(`${event.name}-attach-policy`, {
      role: createRole.name,
      policyArn: createPolicy.arn,
    });

  const console = new aws.cloudwatch.EventRule(`${event.name}-console`, {
    name: event.name,
    description: "",
    ...(event.scheduleExpression && { scheduleExpression: event.scheduleExpression }),
    ...(event.eventPattern && { eventPattern: JSON.stringify(event.eventPattern) }),
    isEnabled: true,
  });

  const eventTargetConfig = {
    rule: console.name,
    arn: event.targetArn,
    roleArn: createRole.arn,
  };

  if (event.inputType === 'inputTransformer' && event.inputTransformer) {
    eventTargetConfig.inputTransformer = {
      inputPaths: event.inputTransformer.inputPaths, // Mantém como objeto (mapa)
      inputTemplate: JSON.stringify(event.inputTransformer.inputTemplate) // String JSON
    };

  } else if (event.inputType === 'inputPath' && event.inputPath) {
    // "Part of the matched event" - usa inputPath para selecionar parte do evento
    eventTargetConfig.inputPath = event.inputPath;
  }

  const eventTarget = new aws.cloudwatch.EventTarget(`${event.name}-target`, eventTargetConfig);

  return eventTarget;
}

async function Create(events) {
  for (const event of events) {
    const eventbridge = await createEvent(event);
  }
}

module.exports = {
  Create
}
