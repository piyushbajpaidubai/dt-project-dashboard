const { google } = require("googleapis");
exports.handler = async (event) => {
  try {
    const privateKey = process.env.GOOGLE_PRIVATE_KEY
      ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\\\\\\\n|\\\\n/g, "\\n")
      : null;
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    await auth.authorize();
    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (event.httpMethod === "GET") {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: "Sheet1!A:B",
      });
      const rows = res.data.values || [];
      const data = {};
      rows.forEach(([key, value]) => { if (key !== "key") data[key] = value; });
      return { statusCode: 200, body: JSON.stringify(data) };
    }
    if (event.httpMethod === "POST") {
      const data = JSON.parse(event.body);
      const values = Object.entries(data).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]);
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "Sheet1!A2",
        valueInputOption: "RAW",
        requestBody: { values },
      });
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }
    return { statusCode: 405, body: "Method not allowed" };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}