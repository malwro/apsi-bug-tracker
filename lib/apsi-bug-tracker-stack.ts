import * as path from 'path';

import { Cors, LambdaIntegration, RestApi } from '@aws-cdk/aws-apigateway';
import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as rds from '@aws-cdk/aws-rds';
import * as dotenv from 'dotenv';

dotenv.config();

export class APSIBugTrackerStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const DB_NAME = process.env.DB_NAME ?? 'apsidb';
    const DB_USERNAME = process.env.DB_USERNAME ?? 'user';
    const DB_PASSWORD = process.env.DB_PASSWORD ?? 'password';
    const DB_PORT = process.env.DB_PORT ?? '3306';

    // Create DB security group
    const vpc = ec2.Vpc.fromLookup(this, 'VPC', { isDefault: true });

    const APSIBugTrackerSG = new ec2.SecurityGroup(this, 'ApsiBugTracker-sg', {
      vpc,
      allowAllOutbound: true,
      description: 'Security group for the APSIBugTracker.',
    });

    APSIBugTrackerSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.allTraffic());

    // Create database instance
    const instance = new rds.DatabaseInstance(this, 'ApsiBugTrackerDB', {
      engine: rds.DatabaseInstanceEngine.mysql({
        version: rds.MysqlEngineVersion.VER_8_0_26,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE2,
        ec2.InstanceSize.MICRO
      ),
      allocatedStorage: 20,
      credentials: rds.Credentials.fromPassword(
        DB_USERNAME,
        cdk.SecretValue.plainText(DB_PASSWORD)
      ),
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      securityGroups: [APSIBugTrackerSG],
      databaseName: DB_NAME,
      backupRetention: cdk.Duration.days(0),
    });

    // Create database lambda layer
    const databaseLayer = new lambda.LayerVersion(this, 'database-layer', {
      code: lambda.Code.fromAsset(path.join('lambda', 'database'), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_9.bundlingImage,
          command: [
            'bash',
            '-c',
            'pip install . -t /asset-output/python && cp -r alembic /asset-output/python/apsi_database && cp alembic.ini /asset-output/python/apsi_database',
          ],
        },
      }),
    });

    // Get all problems lambda
    const getProblemsLambda = new lambda.Function(this, 'GetProblems', {
      code: lambda.Code.fromAsset(path.join('lambda', 'get_problems'), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_9.bundlingImage,
          command: [
            'bash',
            '-c',
            'pip install -r requirements.txt -t /asset-output &&  rsync -av -O --progress . /asset-output --exclude-from=.dockerignore',
          ],
        },
      }),
      handler: 'index.handler', // Optional, defaults to 'handler'
      runtime: lambda.Runtime.PYTHON_3_9, // Optional, defaults to lambda.Runtime.PYTHON_3_7
      environment: {
        LOG_LEVEL: '10', // Debug log level - https://docs.python.org/3/library/logging.html
        DB_HOST: instance.dbInstanceEndpointAddress,
        DB_USERNAME: DB_USERNAME,
        DB_PASSWORD: DB_PASSWORD,
        DB_NAME: DB_NAME,
        DB_PORT: DB_PORT,
      },
      layers: [databaseLayer],
    });

    // Create problem lambda
    const createProblemLambda = new lambda.Function(this, 'CreateProblem', {
      code: lambda.Code.fromAsset(path.join('lambda', 'create_problem'), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_9.bundlingImage,
          command: [
            'bash',
            '-c',
            'pip install -r requirements.txt -t /asset-output &&  rsync -av -O --progress . /asset-output --exclude-from=.dockerignore',
          ],
        },
      }),
      handler: 'index.handler', // Optional, defaults to 'handler'
      runtime: lambda.Runtime.PYTHON_3_9, // Optional, defaults to lambda.Runtime.PYTHON_3_7
      environment: {
        LOG_LEVEL: '10', // Debug log level - https://docs.python.org/3/library/logging.html
        DB_HOST: instance.instanceEndpoint.hostname,
        DB_USERNAME: DB_USERNAME,
        DB_PASSWORD: DB_PASSWORD,
        DB_NAME: DB_NAME,
        DB_PORT: DB_PORT,
      },
      layers: [databaseLayer],
    });

    // Insert init data lambda
    const insertInitDataLambda = new lambda.Function(this, 'InsertInitData', {
      code: lambda.Code.fromAsset(path.join('lambda', 'insert_init_data'), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_9.bundlingImage,
          command: [
            'bash',
            '-c',
            'pip install -r requirements.txt -t /asset-output &&  rsync -av -O --progress . /asset-output --exclude-from=.dockerignore',
          ],
        },
      }),
      handler: 'index.handler', // Optional, defaults to 'handler'
      runtime: lambda.Runtime.PYTHON_3_9, // Optional, defaults to lambda.Runtime.PYTHON_3_7
      environment: {
        LOG_LEVEL: '10', // Debug log level - https://docs.python.org/3/library/logging.html
        DB_HOST: instance.instanceEndpoint.hostname,
        DB_USERNAME: DB_USERNAME,
        DB_PASSWORD: DB_PASSWORD,
        DB_NAME: DB_NAME,
        DB_PORT: DB_PORT,
      },
      layers: [databaseLayer],
    });

    // Get problem by id
    const getProblemByIdLambda = new lambda.Function(this, 'GetProblemById', {
      code: lambda.Code.fromAsset(path.join('lambda', 'get_problem_by_id'), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_9.bundlingImage,
          command: [
            'bash',
            '-c',
            'pip install -r requirements.txt -t /asset-output &&  rsync -av -O --progress . /asset-output --exclude-from=.dockerignore',
          ],
        },
      }),
      handler: 'index.handler', // Optional, defaults to 'handler'
      runtime: lambda.Runtime.PYTHON_3_9, // Optional, defaults to lambda.Runtime.PYTHON_3_7
      environment: {
        LOG_LEVEL: '10', // Debug log level - https://docs.python.org/3/library/logging.html
        DB_HOST: instance.instanceEndpoint.hostname,
        DB_USERNAME: DB_USERNAME,
        DB_PASSWORD: DB_PASSWORD,
        DB_NAME: DB_NAME,
        DB_PORT: DB_PORT,
      },
      layers: [databaseLayer],
    });

    const getProblemsLambdaIntegration = new LambdaIntegration(getProblemsLambda);
    const createProblemLambdaIntegration = new LambdaIntegration(
      createProblemLambda
    );
    const getProblemByIdLambdaIntegration = new LambdaIntegration(
      getProblemByIdLambda
    );
    const insertInitDataLambdaIntegration = new LambdaIntegration(
      insertInitDataLambda
    );

    // Create API Gateway resource
    const apiGateway = new RestApi(this, 'APSIBugTrackerAPI', {
      restApiName: 'APSI BugTracker',
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS,
      },
    });

    // Attach Lambda integration to API Gateway
    // path: /problems
    const problemsRoute = apiGateway.root.addResource('problems');
    problemsRoute.addMethod('GET', getProblemsLambdaIntegration);
    problemsRoute.addMethod('PUT', createProblemLambdaIntegration);

    // path: /problems/{id}
    const problemRoute = problemsRoute.addResource('{id}');
    problemRoute.addMethod('GET', getProblemByIdLambdaIntegration);

    // path: /init-data
    const initDataRoute = apiGateway.root.addResource('init-data');
    initDataRoute.addMethod('PUT', insertInitDataLambdaIntegration);
  }
}
