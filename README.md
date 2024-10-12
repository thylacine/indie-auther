# Welcome to my IndieAuth-er

## What

[IndieAuth](https://indieweb.org/IndieAuth) is a [protocol](https://indieauth.spec.indieweb.org/) which facilitates identifying users uniquely by the URLs they control to third-party applications.  It is an extension of [Oauth 2](https://indieauth.spec.indieweb.org).

This service implements the functionality required to negotiate that identity authentication and validation.

## Let's Do Some Auth

A ```user``` is an entity known to this service, with a credential (currently a password) used to authenticate and login to this service.  
Authentication of a ```user``` is handled by either a [hashed password](https://en.wikipedia.org/wiki/Argon2) stored securely in one of the available database engines, or by optionally delegating to the host machine's [<abbr title="Pluggable Authentication Module">PAM</abbr> subsystem](https://en.wikipedia.org/wiki/Pluggable_Authentication_Modules).
PAM can be used to leverage, exempli gratia, LDAP integration for user authentication.

A ```profile``` is a URL (under control of a ```user```) which contents includes the necessary meta-data informing an application to contact this service for identification validation.  Each ```user``` may have one or more ```profile```s.

Each ```profile``` may also be associated with a customizable list of additional [scopes](https://www.oauth.com/oauth2-servers/scope/) which may be added to any application client grant for convenience.

An example of the user-interface when granting consent to a client application:
![Consent page](./documentation/media/consent-page.png)

## Up And Running

Customize configuration within `config/${NODE_ENV}.js`.  All envs inherit settings from `default.js` if not specified.  Environment is selected using the `NODE_ENV` environment variable value, defaulting to `development` if unset.

Database table initialization and schema version migrations are automated.  Configure SQLite with a database file, or point PostgreSQL to a created database.

Users currently need to be created via the cli, using the `bin/authAddUser.js` script.

The bundled logger spews JSON to stdout.

### Quickstart Example

One way of deploying this server is behind nginx, with the pm2 package to manage the server process, and a local postgres database.  Some details on this are presented here as a rough guide to any parts of this stack which may be unfamiliar.

- Have NodeJS 20-ish available.
- Have PostgreSQL available.
- Clone the server repository.  
  ```git clone https://git.squeep.com/squeep-indie-auther```  
- Install the production dependencies.  
  ```cd squeep-indie-auther```  
  ```NODE_ENV=production npm i```  
- Create a ```config/production.js``` configuration file.  See ```config/default.js``` for available settings.  
  > <pre>
  > 'use strict';
  > // Minimum required configuration settings
  > module.exports = {
  >   encryptionSecret: 'this is a secret passphrase, it is pretty important to be unguessable',
  >   dingus: {
  >     selfBaseUrl: 'https://ia.squeep.com/', // it needs to know how to refer to itself
  >   },
  >   db: {
  >     connectionString: 'postgresql://indieauther:mypassword@localhost/indieauther',
  >   },
  >   chores: { // These are optional, but recommended
  >     scopeCleanupMs: 86400000, // remove unused scopes daily
  >     tokenCleanupMs: 864000000, // remove invalid tokens daily
  >     publishTicketsMs: 86400000, // retry queuing redeemed tickets daily
  >   },
  > };
  > </pre>
- Prepare PostgreSQL with a user and database, using e.g. ```psql```.  
  > <pre>
  > CREATE ROLE indieauther WITH CREATEDB LOGIN PASSWORD 'mypassword';
  > GRANT indieauther TO postgres;
  > CREATE DATABASE indieauther OWNER=indieauther;
  > GRANT ALL PRIVILEGES ON DATABASE indieauther TO indieauther;
  > \c indieauther
  > CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
  > </pre>
- Install a process manager, system-wide.  
  ```npm i -g pm2```
- Configure the process manager to keep the server logs from growing unbounded.  
  ```pm2 install pm2-logrotate```  
  ```pm2 set pm2-logrotate:rotateInterval '0 0 1 * *'``` (rotate monthly)  
  ```pm2 set pm2-logrotate:compress true```  
  ```pm2 startup``` (arrange to start process monitor on system boot)  
- Launch the server, running one process per available CPU, and persist it through reboots.
  ```NODE_ENV=production pm2 start server.js --name indieauther -i max```  
  ```pm2 save```
- Create a user.
  ```NODE_ENV=production node bin/authUserAdd.js myusername```
- Optional: Copy or link the static files to somewhere nginx will serve them from.  This will vary greatly depending on your setup.  
  ```cp -rp static /home/indieauther/ia.squeep.com/html/static```
- Expose the server through nginx.  
  > <pre>
  > server {
  >   listen 443 ssl http2;
  >   ssl_certificate /etc/ssl/nginx/server-chain.pem;
  >   ssl_certificate_key /etc/ssl/nginx/server.key;
  >   server_name ia.squeep.com;
  >   root /home/indieauther/ia.squeep.com/html
  >   try_files $uri $uri/ @indieauther;
  > 
  >   location @indieauther {
  >     proxy_pass http://indieauther$uri;
  >     proxy_set_header Host $host;
  >     proxy_set_header X-Forwarded-For $remote_addr;
  >     proxy_set_header X-Forwarded-Proto $scheme;
  >     proxy_http_version 1.1;
  >   }
  > 
  >   location = / {
  >     proxy_pass http://indieauther$is_args$args;
  >     proxy_set_header Host $host;
  >     proxy_set_header X-Forwarded-For $remote_addr;
  >     proxy_set_header X-Forwarded-Proto $scheme;
  >     proxy_http_version 1.1;
  >   }
  > }
  > </pre>
  ```nginx -s reload```
- The IndieAuth IdP server should now be available!

## Caveats

While this service supports multiple users, currently these users must all be trusted due to profile registration being unconstrained.  A future version may restrict profile assignment to a privileged user tier.

## Resource Service Integration

Other services (resources) may make calls to validate token grants by configuring a pre-shared secret, and authenticating to this server using [an HMAC-style bearer token scheme](https://git.squeep.com/?p=squeep-resource-authentication-module;a=blob_plain;f=README.md;hb=HEAD).

## Ticket Auth

This service can accept proffered [authentication tickets](https://indieweb.org/IndieAuth_Ticket_Auth).  It will attempt to redeem any proffered tickets, then publish the resulting tokens to a configured AMQP/RabbitMQ queue for other services to make use of.  If no AMQP server is configured, the ticket endpoint will be disabled and not advertised.

Ensure the output of the script `bin/ticket-queue-profile.js` is executed on RabbitMQ server to install the needed queue profile.

A ticket-sending UI is also available:
![Ticket Offer page](./documentation/media/ticket-page.png)

## Architecture

A granted token is an encrypted identifier (specifically a UUID assigned to the initial authentication request) which references the user/client relationship stored in the database.  Details such as granted scopes, token expiration, refreshability, and revocation status are stored there.

Uh, more later.

![Entity relationship diagram for Postgres engine](./documentation/media/postgres-er.svg)

### Quirks

This implementation is built atop an in-house API framework, for Reasons.  Limiting the footprint of external dependencies as much as is reasonable is a design goal.

### File Tour

- bin/ - utility scripts
- config/
  - default.js - defines all configuration parameters' default values
  - index.js - merges an environment's values over defaults
  - *.js - environment specific values, edit these as needed
- server.js - launches the application server
- src/
  - chores.js - recurring maintenance tasks
  - common.js - utility functions
  - db/
    - abstract.js - base database class that any engine will implement
    - errors.js - database Error types
    - index.js - database factory
    - schema-version-helper.js - schema migrations aide
    - postgres/
      - index.js - PostgreSQL engine implementation
      - sql/ - statements and schemas
    - sqlite/
      - index.js - SQLite engine implementation
      - sql - statements and schemas
  - enum.js - invariants
  - errors.js - local Error types
  - logger/
    - data-sanitizers.js - logger helpers to scrub sensitive and verbose data
    - index.js - a very simple logging class
  - manager.js - process incoming requests, most of application logic resides here
  - service.js - defines incoming endpoints, linking the API server framework to the manager methods
  - template/ - HTML content
- static/ - static web assets, CSS, images, et cetera
- test/ - unit and coverage tests
