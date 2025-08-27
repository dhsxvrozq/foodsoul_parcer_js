#!/usr/bin/env node

const { Builder, By, until } = require('selenium-webdriver');
const firefox = require('selenium-webdriver/firefox');
const fs = require('fs').promises;
const path = require('path');

// Настройка логирования
const logger = {
    info: (message) => console.log(`${new Date().toISOString()} [INFO] ${message}`),
    error: (message) => console.error(`${new Date().toISOString()} [ERROR] ${message}`),
    warn: (message) => console.warn(`${new Date().toISOString()} [WARN] ${message}`)
};

async function waitForPageLoad(driver, timeout = 30000) {
    await driver.wait(async () => {
        return await driver.executeScript("return document.readyState") === "complete";
    }, timeout);
}

async function initializeDriver() {
    let options = new firefox.Options();
    options.addArguments('--headless'); // Включаем headless-режим

    let driver = await new Builder()
        .forBrowser('firefox')
        .setFirefoxOptions(options)
        .build();

    logger.info("Драйвер инициализирован (headless режим)");
    return driver;
}

async function clickElement(driver, xpath, elementName) {
    try {
        let element = await driver.wait(
            until.elementLocated(By.xpath(xpath)), 
            10000
        );
        await element.click();
        logger.info(`Кликнули на элемент: ${elementName}`);
    } catch (e) {
        logger.error(`Ошибка при клике на ${elementName}: ${e}`);
    }
}

async function getList(driver, xpathTemplate, attr = null) {
    try {
        let elements = await driver.wait(
            until.elementsLocated(By.xpath(xpathTemplate)),
            10000
        );
        
        let values = [];
        for (let element of elements) {
            if (attr === "text" || attr === null) {
                values.push(await element.getText());
            } else {
                values.push(await element.getAttribute(attr));
            }
        }
        
        logger.info(`Найдено ${values.length} элементов по xpath: ${xpathTemplate}`);
        return values;
    } catch (e) {
        logger.warn(`Элементы не найдены: ${e}`);
        return [];
    }
}

async function main() {
    // Чтение JSON конфига вместо YAML
    const config = JSON.parse(await fs.readFile('config.json', 'utf8'));
    let allData = [];
    
    let driver = await initializeDriver();
    try {
        await driver.get(config.url);
        await waitForPageLoad(driver);
        logger.info(`Открыта страница: ${config.url}`);
        
        await clickElement(driver, config.pick_up_xpath, "pickup");
        await waitForPageLoad(driver);
        
        // Проверка на всплывающее окно
        let okButtons = await driver.findElements(By.xpath(config.ok_xpath));
        if (okButtons.length > 0) {
            await clickElement(driver, config.ok_xpath, "ok_button");
            await waitForPageLoad(driver);
        }
        
        let categories = await getList(driver, config.categories, "href");
        logger.info(`Найдено ${categories.length} категорий`);
        
        for (let category of categories) {
            await driver.get(category);
            await waitForPageLoad(driver);
            logger.info(`Открыта категория: ${category}`);
            
            // Повторная проверка на всплывающее окно
            okButtons = await driver.findElements(By.xpath(config.ok_xpath));
            if (okButtons.length > 0) {
                await clickElement(driver, config.ok_xpath, "ok_button");
                await waitForPageLoad(driver);
            }
            
            let titles = await getList(driver, config.titles, "text");
            let prices = await getList(driver, config.prices, "text");
            prices = prices.map(price => parseInt(price.replace(/\D/g, '')) || 0);
            
            for (let i = 0; i < titles.length; i++) {
                allData.push({
                    name: titles[i],
                    price: prices[i]
                });
            }
            
            logger.info(`Добавлено ${titles.length} товаров из ${category.split('/').pop()}`);
        }
        
        await fs.writeFile(
            'menu.json', 
            JSON.stringify(allData, null, 2), 
            'utf8'
        );
        
        logger.info(`Всего товаров: ${allData.length}`);
        logger.info("Все данные сохранены в menu.json");
        
    } finally {
        await driver.quit();
        logger.info("Браузер закрыт");
    }
}

main().catch(e => {
    logger.error(`Ошибка в main: ${e}`);
    process.exit(1);
});