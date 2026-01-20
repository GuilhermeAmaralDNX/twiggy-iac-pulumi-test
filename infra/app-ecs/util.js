const aws = require("@pulumi/aws");

async function CustomECSRoleTask(app,configuration) {


    let assumePolicy =  {
        Version: "2012-10-17",
        Statement: [
          {
            Action: "sts:AssumeRole",
            Principal: {
              Service: "ecs-tasks.amazonaws.com"
            },
            Effect: "Allow",
            Sid: ""
          }
        ]
      }

    if (app.extraTrust){
      for (const ex of app.extraTrust) 
        assumePolicy.Statement.push(ex)
    }

    const roleEcsTaskCustom = await new aws.iam.Role(`CR-${app.name}`, {
        name: `custom-role-${app.name}-${configuration.account}-${configuration.region}`,
        assumeRolePolicy: JSON.stringify(assumePolicy)        
        });
    
      const ecsTask = await new aws.iam.RolePolicyAttachment(`CRPA-${app.name}`, {
        role: roleEcsTaskCustom.name,
        policyArn: "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
      });

      let docPolicy =  await aws.iam.getPolicyDocument({
          version: '2012-10-17',
          statements: app.customRole
      });
    
      const customRolePolcy = await new aws.iam.RolePolicy(`CRP-${app.name}`, {
        role: roleEcsTaskCustom.name,
        name: `ecs-log-group-${configuration.ecsName}-${configuration.account}-${configuration.region}`,
        policy: docPolicy.json
      });

      return roleEcsTaskCustom;
}


module.exports = {
    CustomECSRoleTask
}