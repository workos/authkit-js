# AuthKit JavaScript Library

This library can be used to interface with AuthKit in a client-side JavaScript
application. 

## Installation

```
npm i @workos-inc/authkit-js
```

## Usage

```js
import { createClient } from '@workos-inc/authkit-js'
const authkit = await createClient(clientId: 'your-client-id');
const user = authkit.getUser();
const accessToken = await authkit.getAccessToken();
```
