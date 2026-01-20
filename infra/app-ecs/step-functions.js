const aws = require("@pulumi/aws");

const Create = async (stepFunctionsInput, configuration) => {
    if (!configuration?.stepFunctions?.enabled || !stepFunctionsInput?.length) {
        return [];
    }

    const stepFunctionsList = [];
    const createdCustomPolicies = new Map();

    for (const stepFunction of stepFunctionsInput) {
        // Cria o IAM Role
        const stateMachineRole = new aws.iam.Role(`${stepFunction.name}-role`, {
            assumeRolePolicy: JSON.stringify({
                Version: "2012-10-17",
                Statement: [{
                    Effect: "Allow",
                    Principal: { Service: "states.amazonaws.com" },
                    Action: "sts:AssumeRole",
                }],
            }),
        });

        // Processa Managed Policies
        if (stepFunction.managedPolicies?.length) {
            stepFunction.managedPolicies.forEach((policyArn, index) => {
                new aws.iam.RolePolicyAttachment(`${stepFunction.name}-managed-${index}`, {
                    role: stateMachineRole.name,
                    policyArn: policyArn,
                });
            });
        }

        // Processa Custom Policies
        if (stepFunction.customPolicies?.length) {
            for (const customPolicy of stepFunction.customPolicies) {
                const policyKey = JSON.stringify(customPolicy.policyDocument);
                
                if (!createdCustomPolicies.has(policyKey)) {
                    const newPolicy = new aws.iam.Policy(`${stepFunction.name}-${customPolicy.policyName}`, {
                        name: customPolicy.policyName,
                        policy: customPolicy.policyDocument,
                    });
                    createdCustomPolicies.set(policyKey, newPolicy);
                }

                new aws.iam.RolePolicyAttachment(`${stepFunction.name}-custom-${customPolicy.policyName}`, {
                    role: stateMachineRole.name,
                    policyArn: createdCustomPolicies.get(policyKey).arn,
                });
            }
        }

        // Cria a Step Function
        const stepFunctionResource = new aws.sfn.StateMachine(stepFunction.name, {
            definition: stepFunction.definition,
            roleArn: stateMachineRole.arn,
            tags: stepFunction.tags,
        });

        stepFunctionsList.push(stepFunctionResource);
    }

    return stepFunctionsList;
};

module.exports = { Create };