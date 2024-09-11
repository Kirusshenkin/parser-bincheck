const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const { Parser } = require('json2csv');

(async () => {
  const pLimit = (await import('p-limit')).default;

  const MAX_RETRIES = 3; // Максимальное количество повторных попыток
  const CONCURRENT_REQUESTS = 5; // Максимальное количество одновременных запросов
  const RETRY_DELAY = 120000; // Задержка перед повторной попыткой (2 минуты)

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Функция для выполнения HTTP-запроса с повторными попытками
  async function fetchWithRetries(url, retries = MAX_RETRIES) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await axios.get(url);
        return response.data;
      } catch (error) {
        console.error(`Ошибка при запросе ${url}, попытка ${attempt} из ${retries}:`, error.message);
        if (attempt === retries) {
          throw error;
        }
        console.log(`Ожидание 2 минуты перед повторной попыткой запроса ${url}...`);
        await delay(RETRY_DELAY);
      }
    }
  }

  // Функция для парсинга данных с одной страницы
  async function parsePage(pageNumber) {
    const url = `https://bincheck.org/russia?page=${pageNumber}`;
    try {
      const data = await fetchWithRetries(url);
      const $ = cheerio.load(data);

      const parsedData = [];

      $('table tbody tr').each((index, element) => {
        const bin = $(element).find('td:nth-child(1)').text().trim();
        const brand = $(element).find('td:nth-child(2)').text().trim();
        const bank = $(element).find('td:nth-child(3)').text().trim();
        const type = $(element).find('td:nth-child(4)').text().trim();
        const level = $(element).find('td:nth-child(5)').text().trim();

        parsedData.push({ bin, brand, bank, type, level });
      });

      return parsedData;
    } catch (error) {
      console.error(`Ошибка при парсинге страницы ${pageNumber}:`, error.message);
      return [];
    }
  }

  // Основная функция для парсинга всех страниц
  async function parseAllPages(totalPages) {
    const allData = [];
    const limit = pLimit(CONCURRENT_REQUESTS);

    const promises = [];

    for (let i = 1; i <= totalPages; i++) {
      const promise = limit(() => parsePage(i));
      promises.push(promise);
    }

    const results = await Promise.all(promises);

    results.forEach((pageData) => {
      allData.push(...pageData);
    });

    return allData;
  }

  // Функция для записи данных в CSV
  function writeToCSV(data) {
    const fields = ['bin', 'brand', 'bank', 'type', 'level'];
    const parser = new Parser({ fields });
    const csv = parser.parse(data);

    fs.writeFile('parsed_data.csv', csv, (err) => {
      if (err) {
        console.error('Ошибка при записи в CSV:', err.message);
      } else {
        console.log('Данные успешно записаны в parsed_data.csv');
      }
    });
  }

  // Пример использования
  const totalPages = 73; // Общее количество страниц для парсинга
  const result = await parseAllPages(totalPages);
  writeToCSV(result);
})();
