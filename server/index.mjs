// Local / Render entry point.   Usage: npm run dev   or   npm start
import { app } from './app.mjs';

const port = +process.env.PORT || 3000;
app.listen(port, () => console.log(`Gondo Motors running at http://localhost:${port}`));
