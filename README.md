# @jahed/firebase-rest

Firebase JS SDK API using Firebase REST API under the hood instead of WebSockets.

- Supports most of [Firebase Real-time Database's Compat JS SDK API](https://firebase.google.com/docs/reference/js/v8/firebase.database).
- Use HTTP requests instead of WebSockets without changing any code.
- All queries are one-off, not real-time.

## Installation

```sh
npm install @jahed/firebase-rest
```

## Usage

```js
import firebase from "firebase/compat/app";
import { createFirebaseREST } from "@jahed/createFirebaseREST";

// Provide the app to createFirebaseREST to create the wrapper.
const firebaseREST = createFirebaseREST(
  firebaseApp.initializeApp({
    apiKey: FN_FIREBASE_API_KEY,
    authDomain: FN_FIREBASE_AUTH_DOMAIN,
    databaseURL: FN_FIREBASE_DATABASE_URL,
    storageBucket: FN_FIREBASE_STORAGE_URL,
  })
);

// Use firebaseREST to access REST APIs instead of WebSockets.
const snapshot = await firebase.database().ref("/data").get();
console.log(snapshot.val());
```

## License

Copyright (C) 2025 Jahed Ahmed

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
