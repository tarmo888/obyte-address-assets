'use strict';

(async () => {

  const obyteAddressInput = $('#input-obyte-address');
  const btnClear = $('#btn-clear');
  const topHodlers = $('#top-hodlers');
  const cardContainer = $('#card-container');
  const cardContainer2 = $('#card-container2');
  const totalContainer = $('#total-container');
  const chartContainer = $('#chart-container');
  const loadingContainer = $('#loading-container');
  const exchangesContainer = $('#exchanges-container');
  const addressLinksContainer = $('#address-links-container');
  const addressTypeContainer = $('#address-type');

  const template = $('#card-template')[0].innerHTML;

  const swapBaseAAs = ['GS23D3GQNNMNJ5TL4Z5PINZ5626WASMA'];
  const curveBaseAAs = [
    'FCFYMFIOGS363RLDLEWIDBIIBU7M7BHP', '3RNNDX57C36E76JLG2KAQSIASAYVGAYG', // v1
    '3DGWRKKWWSC6SV4ZQDWEHYFRYB4TGPKX', 'CD5DNSVS6ENG5UYILRPJPHAB3YXKA63W', // v2
  ];
  const stableBaseAAs = [
    'GEZGVY4T3LK6N4NJAKNHNQIVAI5OYHPC', // v1 (deposit)
    'YXPLX6Q3HBBSH2K5HLYM45W7P7HFSEIN', // v2
  ];
  const stabilityBaseAAs = [
    '7DTJZNB3MHSBVI72CKXRIKONJYBV7I2Z', 'WQBLYBRAMJVXDWS7BGTUNUTW2STO6LYP', // v1 (arb)
    '5WOTEURNL2XGGKD2FGM5HEES4NKVCBCR', // v2
  ];
  const client = new obyte.Client('wss://obyte.org/bb', {reconnect: true});
  let chart;

  async function getObyteMarketData() {
    const requestResult = await fetch('https://api.coinpaprika.com/v1/coins/gbyte-obyte/markets');
    const result = await requestResult.json();

    const exchangesPrices = result
      .map(item => {
        return {
          marketUrl: item.market_url,
          pair: item.pair,
          exchangeId: item.exchange_id,
          exchangeName: item.exchange_name,
          volumeShare: item.adjusted_volume_24h_share,
          price: item.quotes.USD.price
        }
      }).filter(item => {
        return [
          'bittrex',
          //'bit-z',
          //'cryptox',
          'bitladon',
          'uniswap-v3',
          'pancakeswap-v2',
          'quickswap'
        ].includes(item.exchangeId);
      });

    const averageUSDPrice = exchangesPrices.reduce((sum, item) => {
        return sum + item.price * item.volumeShare/100;
    }, 0);

    exchangesPrices.length = 6;
    exchangesPrices.forEach(market => {
      // fix URLs
      market.marketUrl = (market.marketUrl === 'https://cryptox.pl' && market.pair === 'GBYTE/BTC') ? 'https://cryptox.pl/GBYTE-BTC.html' : market.marketUrl;
      market.marketUrl = (market.marketUrl === 'https://cryptox.pl' && market.pair === 'GBYTE/BCH') ? 'https://cryptox.pl/GBYTE-BCH.html' : market.marketUrl;
      market.marketUrl = (!market.marketUrl && market.exchangeId === 'bitladon') ? 'https://www.bitladon.com/obyte' : market.marketUrl;
      market.marketUrl = (!market.marketUrl && market.exchangeId === 'uniswap-v3') ? 'https://app.uniswap.org/#/swap?outputCurrency=0x31f69de127c8a0ff10819c0955490a4ae46fcc2a' : market.marketUrl;
      market.marketUrl = (!market.marketUrl && market.exchangeId === 'pancakeswap-v2') ? 'https://pancakeswap.finance/swap?outputCurrency=0xeb34de0c4b2955ce0ff1526cdf735c9e6d249d09' : market.marketUrl;
      market.marketUrl = (!market.marketUrl && market.exchangeId === 'quickswap') ? 'https://quickswap.exchange/#/swap?outputCurrency=0xab5f7a0e20b0d056aed4aa4528c78da45be7308b' : market.marketUrl;

      exchangesContainer.append(`<div class="col-6"><a class="text-center"${(market.marketUrl ? ` href="${market.marketUrl}"` : '')} target="_blank"><strong>$${market.price.toFixed(2)}</strong> <span class="d-block">${market.exchangeName} <small>(${market.pair})</small></span></a></div>`);
    });

    return {
      averageUSDPrice
    }
  }

  async function getAddressBalances(address) {
    return new Promise((resolve, reject) => {
      client.api.getBalances([address], function (err, result) {

        if (err) {
          return reject(err);
        }

        return resolve(result[address]);
      });
    });
  }

  async function getLiquidityBalances(address) {
    const assets = {};
    return new Promise((resolve, reject) => {
      client.api.getAaStateVars({
        address: '7AUBFK4YAUGUF3RWWYRFXXF7BBWY2V7Y',
        var_prefix: `amount_${address}_`,
      }, function (err, assetBalances) {
        if (err) {
          return reject(err);
        }
        Object.keys(assetBalances).forEach(var_name => {
          const assetID = var_name.replace(`amount_${address}_`, '');
          const total = assetBalances[var_name];
          if (total) {
            assets[assetID] = {};
            assets[assetID].address = '7AUBFK4YAUGUF3RWWYRFXXF7BBWY2V7Y';
            assets[assetID].total = total;
            assets[assetID].stable = total;
            assets[assetID].pending = 0;
          }
        });
        return resolve(assets);
      });
    });
  }

  async function getAssetDataFromAaVars() {
    const assets = {};
    const descriptions = {};
    return new Promise((resolve, reject) => {
      client.api.getAaStateVars({
        address: 'O6H6ZIFI57X3PLTYHOCVYPP5A553CYFQ',
        var_prefix: `a2s_`,
      }, function (err, assetNames) {
        if (err) {
          return reject(err);
        }
        Object.keys(assetNames).forEach(var_name => {
          let assetID = var_name.replace('a2s_', '');
          assets[assetID] = assets[assetID] || {};
          assets[assetID].name = assetNames[var_name];
        });
        client.api.getAaStateVars({
          address: 'O6H6ZIFI57X3PLTYHOCVYPP5A553CYFQ',
          var_prefix: `current_desc_`,
        }, function (err, assetDescripitons) {
          if (err) {
            return reject(err);
          }
          Object.keys(assetDescripitons).forEach(var_name => {
            descriptions[assetDescripitons[var_name]] = var_name.replace('current_desc_', '');
          });
          client.api.getAaStateVars({
            address: 'O6H6ZIFI57X3PLTYHOCVYPP5A553CYFQ',
            var_prefix: `decimals_`,
          }, function (err, assetDecimals) {
            if (err) {
              return reject(err);
            }
            Object.keys(assetDecimals).forEach(var_name => {
              let descriptionID = var_name.replace('decimals_', '');
              let assetID = descriptions[descriptionID];
              assets[assetID] = assets[assetID] || {};
              assets[assetID].decimal = assetDecimals[var_name];
            });
            return resolve(assets);
          });
        });
      });
    });
  }

  async function getDefinition(address) {
    return new Promise((resolve, reject) => {
      client.api.getDefinition(address, function (err, result) {

        if (err) {
          return reject(err);
        }

        return resolve(result);
      });
    });
  }

  async function getAddressAssets(address, marketData) {
    const currentGBytePrice = marketData.averageUSDPrice;
    let balance;
    const balance1 = await getAddressBalances(address) || {};
    const balance2 = await getLiquidityBalances(address) || {};
    if (!Object.keys(balance1).length && !Object.keys(balance2).length) {
      toastr.error('no balance for Obyte Address', 'Error');
      return;
    }

    const definition = await getDefinition(address);
    let addressType = 'unknown';
    if (definition) {
      if (definition[0] === 'sig') {
        addressType = 'regular';
      }
      else if (definition[0] === 'r of set') {
        addressType = `${definition[1].required}-of-${definition[1].set.length} multisig`;
      }
      else if (definition[0] === 'and' || definition[0] === 'or') {
        addressType = 'smart-contract';
      }
      else if (definition[0] === 'autonomous agent') {
        addressType = 'Autonomous Agent';
        if (swapBaseAAs.includes(definition[1].base_aa)) {
          addressType = 'swap AA';
        }
        else if (curveBaseAAs.includes(definition[1].base_aa)) {
          addressType = 'curve AA';
        }
        else if (stableBaseAAs.includes(definition[1].base_aa)) {
          addressType = 'stablecoin AA';
        }
        else if (stabilityBaseAAs.includes(definition[1].base_aa)) {
          addressType = 'stability AA';
        }
      }
    }
    addressTypeContainer.text(addressType);

    assetData = assetData || await getAssetDataFromAaVars();

    currentPrices = currentPrices || await fetch('https://bb-odds.herokuapp.com/api/rates')
      .then(response => response.json())
      .catch(console.error);

    currentPrices = currentPrices || await fetch('https://referrals.ostable.org/prices')
      .then(response => response.json())
      .catch(console.error);

    currentPrices = currentPrices || await fetch('https://data.ostable.org/api/v1/assets')
      .then(response => response.json())
      .catch((error) => {
        toastr.error('Price data not available', 'Error');
        console.error(error);
      });

    const balanceKeys1 = Object.keys(balance1);
    balance = balance1;
    const assets1 = await Promise.all(balanceKeys1.map(makeAssetsList));

    const balanceKeys2 = Object.keys(balance2);
    balance = balance2;
    const assets2 = await Promise.all(balanceKeys2.map(makeAssetsList));

    const assets = assets1.concat(assets2);

    return assets.filter(a => a).sort(function (a, b) {
      return b.currentValueInGB - a.currentValueInGB;
    });

    async function makeAssetsList(key) {
      const asset = assetData[key];
      if (!asset && key !== 'base') {
        return;
      }

      if (asset) {
        if (addressType === 'swap AA' && asset.name.startsWith('OPT-')) return false;
        if (addressType === 'curve AA' && (asset.name.startsWith('GR') || asset.name.startsWith('I'))) return false;
        if (addressType === 'stablecoin AA' && asset.name.startsWith('O')) return false;
        if (addressType === 'stability AA' && (asset.name.startsWith('SF') || asset.name.startsWith('I') || asset.name.endsWith('ARB') || asset.name.endsWith('ARB2'))) return false;
      }

      const addressBalance = balance[key];
      let currentBalance;

      if (key === 'base') {
        currentBalance = addressBalance.total / Math.pow(10, 9);
        return {
          address: addressBalance.address || address,
          balance: currentBalance,
          baseBalance: addressBalance.total,
          currentValueInGB: currentBalance,
          currentValueInUSD: currentBalance * currentGBytePrice,
          unit: 'GBYTE'
        }
      }
      currentBalance = addressBalance.total / Math.pow(10, asset && asset.decimal ? asset.decimal : 0);

      let gbyteValue = 0;
      if (currentPrices) {
        if (currentPrices.data && currentPrices.data[key] && currentGBytePrice) {
          gbyteValue = currentPrices.data[key] / currentGBytePrice;
        }
        else if (currentPrices.data && currentPrices.data[key + '_USD'] && currentGBytePrice) {
          gbyteValue = currentPrices.data[key + '_USD'] / currentGBytePrice;
        }
        else {
          const currentGByteValue = _.find(currentPrices, {asset_id: key});
          gbyteValue = currentGByteValue && currentGByteValue.last_gbyte_value ? currentGByteValue.last_gbyte_value : 0;
        }
      }

      return {
        address: addressBalance.address || address,
        balance: currentBalance,
        baseBalance: addressBalance.total,
        decimal: asset.decimal,
        unit: asset.name,
        currentValueInGB: gbyteValue * currentBalance,
        currentValueInUSD: gbyteValue * currentBalance * currentGBytePrice,
      }
    }
  }

  async function getTopHodlers() {
    topBalances = topBalances || await fetch('https://referrals.ostable.org/distributions/next')
      .then(response => response.json())
      .catch(console.error);

    if (topBalances) {
      const hodlers = topBalances.data.balances.map(item => {
        return `<a href="#/${item.address}" class="address">${item.address}</a><br>`;
      });
      $('#hodlers-list').html(hodlers.slice(0, 10).join('\n'));
      topHodlers.removeClass('d-none');
    }
  }

  function clear() {
    $('.address-input-section').removeClass('mini');
    obyteAddressInput.val('');
    cardContainer.html('');
    cardContainer2.html('');
    totalContainer.addClass('d-none');
    chartContainer.addClass('d-none');
    addressLinksContainer.addClass('d-none');
    btnClear.addClass('d-none');
    window.history.pushState(null, null, document.location.pathname);
    getTopHodlers();
  }

  function initToastr() {
    toastr.options = {
      closeButton: false,
      debug: false,
      newestOnTop: false,
      progressBar: true,
      positionClass: 'toast-top-right',
      preventDuplicates: true,
      onclick: null,
      showDuration: 300,
      hideDuration: 1000,
      timeOut: 5000,
      extendedTimeOut: 1000,
      showEasing: 'swing',
      hideEasing: 'linear',
      showMethod: 'fadeIn',
      hideMethod: 'fadeOut'
    }
  }

  async function getAssets() {
    const address = obyteAddressInput.val().trim();

    if (address.length === 0) {
      return;
    }
    cardContainer.html('');
    cardContainer2.html('');
    totalContainer.addClass('d-none');
    chartContainer.addClass('d-none');
    addressLinksContainer.addClass('d-none');

    const isValidAddress = obyte.utils.isValidAddress(address);

    if (!isValidAddress) {
      toastr.error('Invalid Obyte Address', 'Error');
      return;
    }

    marketData = marketData || await getObyteMarketData();
    const addressAsset = await getAddressAssets(address, marketData);
    if (!addressAsset) return;

    topHodlers.addClass('d-none');
    loadingContainer.removeClass('d-none');

    const totalGB = addressAsset.reduce((sum, item) => {
      return sum + item.currentValueInGB;
    }, 0);

    const totalUSD = addressAsset.reduce((sum, item) => {
      return sum + item.currentValueInUSD;
    }, 0);

    $('.address-input-section').addClass('mini');

    const chartAssetValueInGB = [];
    const chartAssetName = [];

    addressAsset.forEach(outputCards);

    async function outputCards(asset) {
      chartAssetValueInGB.push(asset.currentValueInGB.toFixed(3));
      chartAssetName.push(asset.unit);

      let assetStyle = '';
      if (asset.unit.endsWith('ARB') || asset.unit.endsWith('ARB2')) {
        assetStyle = 'background: gray;';
      } else if (asset.unit.startsWith('OPT-')) {
        assetStyle = 'background: #008080;';
      } else if (asset.unit.startsWith('SF')) {
        assetStyle = 'background: #800080;';
      } else if (asset.unit.startsWith('GR')) {
        assetStyle = 'background: red;';
      } else if (asset.unit.startsWith('I')) {
        assetStyle = 'background: green;';
      } else if (asset.unit.startsWith('O')) {
        assetStyle = 'background: blue;';
      }

      const tmp = template
        .replace(/{{asset}}/g, asset.unit)
        .replace(/{{assetStyle}}/g, assetStyle)
        .replace(/{{amount}}/g, asset.balance.toFixed(asset.decimal || (asset.unit === 'GBYTE' ? 9 : 0)))
        .replace(/{{amountInGB}}/g, Number(asset.currentValueInGB.toFixed(3)).toLocaleString())
        .replace(/{{amountInUSD}}/g, Number(asset.currentValueInUSD.toFixed(2)).toLocaleString());

      if (asset.address === address) {
        cardContainer.append(tmp);
      }
      else {
        if (!cardContainer2.children().length) {
          cardContainer2.append(`<h2 class="text-white">Deposited on ${asset.address}</h2>`);  
        }
        cardContainer2.append(tmp);
      }
    }

    if (chart) {
      chart.destroy();
    }
    chart = new Chart($('#chart'), {
      type: 'doughnut',
      data: {
        datasets: [{
          data: chartAssetValueInGB,
          backgroundColor: [
            'rgba(255, 103, 0, 0.8)',
            'rgba(246, 62, 94, 0.8)',
            'rgba(196, 68, 140, 0.8)',
            'rgba(125, 83, 152, 0.8)',
            'rgba(64, 84, 129, 0.8)',
            'rgba(47, 72, 88, 0.8)',
            'rgba(194, 125, 0, 0.8)',
            'rgba(125, 135, 0, 0.8)',
            'rgba(36, 135, 0, 0.8)'
          ]
        }],
        labels: chartAssetName
      },
      options: {
        legend: {
          display: false
        },
        tooltips: {
          callbacks: {
            label: (tooltipItem, data) => {
              const dataset = data.datasets[tooltipItem.datasetIndex];
              const total = dataset.data.reduce((previousValue, currentValue) => {
                return previousValue + parseFloat(currentValue);
              }, 0);

              const currentValue = parseFloat(dataset.data[tooltipItem.index]) || 0;
              const currentLabel = data.labels[tooltipItem.index] || '';

              const precentage = Math.floor((currentValue / total) * 100);
              return `${currentLabel} \n ${precentage}% (${currentValue.toFixed(3)} GBYTE)`;
            }
          }
        }
      }
    });

    $('#open-explorer').attr('href', `https://explorer.obyte.org/#${address}`);
    $('#open-liquidity').attr('href', `https://liquidity.obyte.org/?address=${address}`);
    $('#open-obyte-io').attr('href', `https://obyte.io/@${address}`);
    $('#market-price').text(`1 GBYTE = $${marketData.averageUSDPrice.toFixed(2)}`);
    $('#market-price-reverse').text(`$1 = ${(1 / marketData.averageUSDPrice).toFixed(9)} GBYTE`);
    $('#total-gb').text(`${Number(totalGB.toFixed(3)).toLocaleString()} GBYTE`);
    $('#total-usd').text(`$${Number(totalUSD.toFixed(2)).toLocaleString()}`);
    loadingContainer.addClass('d-none');
    addressLinksContainer.removeClass('d-none');
    totalContainer.removeClass('d-none');
    chartContainer.removeClass('d-none');
    btnClear.removeClass('d-none');
  }

  initToastr();
  let topBalances;
  let marketData;
  let currentPrices;
  let assetData;

  obyteAddressInput.val(window.location.hash.replace(/^#\//, ''));
  if (obyteAddressInput.val()) {
    getAssets();
  } else {
    clear();
  }

  $(window).bind('hashchange', function (e) {
    const address = window.location.hash.replace(/^#\//, '');

    if (!address || address.length === 0) {
      clear();
      return;
    }
    obyteAddressInput.val(address);
    getAssets();
  });

  $('#obyte-address-form').on('submit', (e) => {
    e.preventDefault();
    window.history.pushState(null, null, document.location.pathname + '#/' + obyteAddressInput.val().trim());
    getAssets();
  });

  btnClear.on('click', () => {
    clear();
  });

  $(document).on('click', '.coming-soon', () => {
    alert('Coming Soon');
  });


})();
