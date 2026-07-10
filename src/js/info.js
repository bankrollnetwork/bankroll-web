const CHART_API_URL =  'https://api.bankroll.network/info' //'http://localhost:3002/info'

async function main() {


    /* 03.01. Getting Colors from CSS */
    var rootStyle = getComputedStyle(document.body);
    var themeColor1 = rootStyle.getPropertyValue("--theme-color-1").trim();
    var themeColor2 = rootStyle.getPropertyValue("--theme-color-2").trim();
    var themeColor3 = rootStyle.getPropertyValue("--theme-color-3").trim();
    var themeColor4 = rootStyle.getPropertyValue("--theme-color-4").trim();
    var themeColor5 = rootStyle.getPropertyValue("--theme-color-5").trim();
    var themeColor6 = rootStyle.getPropertyValue("--theme-color-6").trim();
    var themeColor1_10 = rootStyle
      .getPropertyValue("--theme-color-1-10")
      .trim();
    var themeColor2_10 = rootStyle
      .getPropertyValue("--theme-color-2-10")
      .trim();
    var themeColor3_10 = rootStyle
      .getPropertyValue("--theme-color-3-10")
      .trim();
    var themeColor4_10 = rootStyle
      .getPropertyValue("--theme-color-4-10")
      .trim();

    var themeColor5_10 = rootStyle
      .getPropertyValue("--theme-color-5-10")
      .trim();
    var themeColor6_10 = rootStyle
      .getPropertyValue("--theme-color-6-10")
      .trim();
  var primaryColor = rootStyle.getPropertyValue("--primary-color").trim();
  var foregroundColor = rootStyle
    .getPropertyValue("--foreground-color")
    .trim();
  var separatorColor = rootStyle.getPropertyValue("--separator-color").trim();



  Chart.defaults.BarWithShadow = Chart.defaults.bar;
  Chart.controllers.BarWithShadow = Chart.controllers.bar.extend({
    draw: function(ease) {
      Chart.controllers.bar.prototype.draw.call(this, ease);
      var ctx = this.chart.ctx;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.15)";
      ctx.shadowBlur = 12;
      ctx.shadowOffsetX = 5;
      ctx.shadowOffsetY = 10;
      ctx.responsive = true;
      Chart.controllers.bar.prototype.draw.apply(this, arguments);
      ctx.restore();
    }
  });


  Chart.defaults.DoughnutWithShadow = Chart.defaults.doughnut;
  Chart.controllers.DoughnutWithShadow = Chart.controllers.doughnut.extend({
    draw: function(ease) {
      Chart.controllers.doughnut.prototype.draw.call(this, ease);
      let ctx = this.chart.chart.ctx;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.15)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 10;
      ctx.responsive = true;
      Chart.controllers.doughnut.prototype.draw.apply(this, arguments);
      ctx.restore();
    }
  });


  var chartTooltip = {
    backgroundColor: foregroundColor,
    titleFontColor: primaryColor,
    borderColor: separatorColor,
    borderWidth: 0.5,
    bodyFontColor: primaryColor,
    bodySpacing: 10,
    xPadding: 15,
    yPadding: 15,
    cornerRadius: 0.15,
    displayColors: false,
    mode: 'index',
    callbacks: {
      label: function(tooltipItem, myData) {
        var label = myData.datasets[tooltipItem.datasetIndex].label || '';
        if (label) {
          label += ': ';
        }
        label = numeral(tooltipItem.yLabel).format('0.000 a').toUpperCase() + ' TRX' // parseFloat(tooltipItem.value).toFixed(2);
        return label;
      }
    }
  };


  var centerTextPlugin = {
    afterDatasetsUpdate: function(chart) {},
    beforeDraw: function(chart) {
      var width = chart.chartArea.right;
      var height = chart.chartArea.bottom;
      var ctx = chart.chart.ctx;
      ctx.restore();

      var activeLabel = chart.data.labels[0];
      var activeValue = chart.data.datasets[0].data[0];
      var dataset = chart.data.datasets[0];
      var meta = dataset._meta[Object.keys(dataset._meta)[0]];
      var total = meta.total;

      var activePercentage = parseFloat(
        ((activeValue / total) * 100).toFixed(1)
      );
      activePercentage = chart.legend.legendItems[0].hidden
        ? 0
        : activePercentage;

      if (chart.pointAvailable) {
        activeLabel = chart.data.labels[chart.pointIndex];
        activeValue =
          chart.data.datasets[chart.pointDataIndex].data[chart.pointIndex];

        dataset = chart.data.datasets[chart.pointDataIndex];
        meta = dataset._meta[Object.keys(dataset._meta)[0]];
        total = meta.total;
        activePercentage = parseFloat(
          ((activeValue / total) * 100).toFixed(1)
        );
        activePercentage = chart.legend.legendItems[chart.pointIndex].hidden
          ? 0
          : activePercentage;
      }

      ctx.font = "36px" + " Nunito, sans-serif";
      ctx.fillStyle = primaryColor;
      ctx.textBaseline = "middle";

      var text = activePercentage + "%",
        textX = Math.round((width - ctx.measureText(text).width) / 2),
        textY = height / 2;
      ctx.fillText(text, textX, textY);

      ctx.font = "14px" + " Nunito, sans-serif";
      ctx.textBaseline = "middle";

      var text2 = activeLabel,
        textX = Math.round((width - ctx.measureText(text2).width) / 2),
        textY = height / 2 - 30;
      ctx.fillText(text2, textX, textY);

      ctx.save();
    },
    beforeEvent: function(chart, event, options) {
      var firstPoint = chart.getElementAtEvent(event)[0];

      if (firstPoint) {
        chart.pointIndex = firstPoint._index;
        chart.pointDataIndex = firstPoint._datasetIndex;
        chart.pointAvailable = true;
      }
    }
  };


  let chartToolTipCategory = Object.assign({}, chartTooltip)
  delete chartToolTipCategory.callbacks

  if (document.getElementById("categoryChart")) {


    let percentageData = await $.ajax({
      url: CHART_API_URL+'/events_percentage'
    });


    // merge slice and sponsorship together

    let sponsorshipIndex = _.findIndex(percentageData, (obj)=>{
      return obj.event === 'Sponsorship'
    })
    let sliceIndex = _.findIndex(percentageData, (obj)=>{
      return obj.event === 'Slice'
    })

    let allSponsorshipObj = {event: 'Sponsorship'}
    allSponsorshipObj.amount = percentageData[sponsorshipIndex].amount + percentageData[sliceIndex].amount

    percentageData[sponsorshipIndex] = allSponsorshipObj
    percentageData.splice(sliceIndex, 1)

    // change order of events in array
    sponsorshipIndex = _.findIndex(percentageData, (obj)=>{
      return obj.event === 'Sponsorship'
    })
    let depositIndex = _.findIndex(percentageData, (obj)=>{
      return obj.event === 'Invest'
    })
    let withdrawIndex = _.findIndex(percentageData, (obj)=>{
      return obj.event === 'Withdraw'
    })
    let donationIndex = _.findIndex(percentageData, (obj)=>{
      return obj.event === 'Donation'
    })


    const orderedPercentageData = [
      percentageData[depositIndex],
      percentageData[withdrawIndex],
      percentageData[sponsorshipIndex],
      percentageData[donationIndex]
    ]

    const percentageLabels = _.map(orderedPercentageData, (obj)=>{
      if (obj.event === 'Invest') {
        return 'Deposits'
      }
      if (obj.event === 'Withdraw') {
        return 'Withdrawals'
      }
      if (obj.event === 'Sponsorship') {
        return 'Sponsorships'
      }
      if (obj.event === 'Donation') {
        return 'Donations'
      }
    })


    let amountSum = _.reduce(orderedPercentageData, function(sum, obj) {
      return sum + obj.amount;
    }, 0);

    const percentageValues = _.map(orderedPercentageData, (obj)=>{
      return  Math.round( ((obj.amount / amountSum) * 10000 ) ) / 100
    })



    var categoryChart = document.getElementById("categoryChart");
    var percentageChart = new Chart(categoryChart, {
      plugins: [centerTextPlugin],
      type: "DoughnutWithShadow",
      data: {
        labels: percentageLabels,
        datasets: [
          {
            label: "",
            borderColor: [themeColor1, themeColor2, themeColor4, themeColor3],
            backgroundColor: [
              themeColor1_10,
              themeColor2_10,
              themeColor4_10,
              themeColor3_10,
            ],
            borderWidth: 2,
            data: percentageValues
          }
        ]
      },
      draw: function() {},
      options: {
        plugins: {
          datalabels: {
            display: false
          }
        },
        responsive: true,
        maintainAspectRatio: false,
        cutoutPercentage: 80,
        title: {
          display: false
        },
        layout: {
          padding: {
            bottom: 20
          }
        },
        legend: {
          position: "bottom",
          labels: {
            padding: 30,
            usePointStyle: true,
            fontSize: 12
          }
        },
        tooltips: chartToolTipCategory
      }
    });

    // const percentageData = await $.ajax({
    //   url: CHART_API_URL+'/events_percentage'
    // });

    // const percentageLabels = _.map(percentageData, 'event')

    // let amountSum = _.reduce(percentageData, function(sum, obj) {
    //   return sum + obj.amount;
    // }, 0);
    // //amountSum = tronWeb.fromSun(amountSum)
    // const percentageValues = _.map(percentageData, (obj)=>{
    //   return  Math.round( ((obj.amount / amountSum) * 10000 ) ) / 100
    // })

    // percentageChart.data.labels = percentageLabels
    // percentageChart.data.datasets[0].data = percentageValues


    // percentageChart.update()


  }


  if (document.getElementById("barChart24h")) {
    var barChart24hNode = document
      .getElementById("barChart24h")
      .getContext("2d");
    var chart24h = new Chart(barChart24hNode, {
      type: "BarWithShadow",
      options: {
        plugins: {
          datalabels: {
            display: false
          }
        },
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          yAxes: [
            {
              scaleLabel: {
                display: true,
                labelString: 'TRX'
              },
              gridLines: {
                display: true,
                lineWidth: 1,
                color: "rgba(0,0,0,0.1)",
                drawBorder: false
              },
              ticks: {
                callback: function(label, index, labels) {
                  return numeral(label).format('0.0 a').toUpperCase();
                },
                beginAtZero: true,
                // stepSize: 100,
                // min: 300,
                // max: 800,
                padding: 20
              }
            }
          ],
          xAxes: [{
            type: 'time',
            distribution: 'series',
            offset: true,
            gridLines: {
              display: false
            },
            time: {
              displayFormats: {
                hour:	'MMM D, ha',
                day:	'MMM D'
               },
//               parser: function (utcMoment) {
// console.log('utc',utcMoment, moment(utcMoment).utcOffset('+120'))

//                     return moment(utcMoment).utcOffset('+0300');
//               }  
            },
            ticks: {
              source: 'data',
              autoSkip: true,
              //utoSkipPadding: 420
            }
          }]
        },
        legend: {
          position: "bottom",
          labels: {
            padding: 30,
            usePointStyle: true,
            fontSize: 12
          }
        },
        tooltips: chartTooltip
      },
      data: {
        labels: [],
        datasets: [
          {
            label: "Deposits",
            borderColor: themeColor1,
            backgroundColor: themeColor1_10,
            data: [],
            borderWidth: 2
          },
          {
            label: "Withdrawals",
            borderColor: themeColor2,
            backgroundColor: themeColor2_10,
            data: [],
            borderWidth: 2
          }
        ]
      }
    });

    const investData24 = await $.ajax({
      url: CHART_API_URL+'/invest_data_24h'
    });

    const withdrawData24 = await $.ajax({
      url: CHART_API_URL+'/withdraw_data_24h'
    });
    chart24h.data.datasets[0].data = investData24
    chart24h.data.datasets[1].data = withdrawData24

    chart24h.update()
  }

  if (document.getElementById("barChart7d")) {
    var barChart7dNode = document
      .getElementById("barChart7d")
      .getContext("2d");
    var chart7d = new Chart(barChart7dNode, {
      type: "BarWithShadow",
      options: {
        plugins: {
          datalabels: {
            display: false
          }
        },
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          yAxes: [
            {
              scaleLabel: {
                display: true,
                labelString: 'TRX'
              },
              gridLines: {
                display: true,
                lineWidth: 1,
                color: "rgba(0,0,0,0.1)",
                drawBorder: false
              },
              ticks: {
                callback: function(label, index, labels) {
                  return numeral(label).format('0.0 a').toUpperCase();
                },
                beginAtZero: true,
                // stepSize: 100,
                // min: 300,
                // max: 800,
                padding: 20
              }
            }
          ],
          xAxes: [{
            type: 'time',
            distribution: 'series',
            offset: true,
            gridLines: {
              display: false
            },
            time: {
              displayFormats: {
                hour:	'MMM D',
                day:	'MMM D'
              }
            },
            ticks: {
              source: 'data',
              autoSkip: true,
              //autoSkipPadding: 420
            }
          }]
        },
        legend: {
          position: "bottom",
          labels: {
            padding: 30,
            usePointStyle: true,
            fontSize: 12
          }
        },
        tooltips: chartTooltip
      },
      data: {
        labels: [],
        datasets: [
          {
            label: "Deposits",
            borderColor: themeColor1,
            backgroundColor: themeColor1_10,
            data: [],
            borderWidth: 2
          },
          {
            label: "Withdrawals",
            borderColor: themeColor2,
            backgroundColor: themeColor2_10,
            data: [],
            borderWidth: 2
          }
        ]
      }
    });

    const investData7d = await $.ajax({
      url: CHART_API_URL+'/invest_data_7d'
    });

    const withdrawData7d = await $.ajax({
      url: CHART_API_URL+'/withdraw_data_7d'
    });
    chart7d.data.datasets[0].data = investData7d
    chart7d.data.datasets[1].data = withdrawData7d

    chart7d.update()
  }

  if (document.getElementById("barChartAll")) {
    var barChartAllNode = document
      .getElementById("barChartAll")
      .getContext("2d");
    var chartAll = new Chart(barChartAllNode, {
      type: "BarWithShadow",
      options: {
        plugins: {
          datalabels: {
            display: false
          }
        },
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          yAxes: [
            {
              scaleLabel: {
                display: true,
                labelString: 'TRX'
              },
              gridLines: {
                display: true,
                lineWidth: 1,
                color: "rgba(0,0,0,0.1)",
                drawBorder: false
              },
              ticks: {
                callback: function(label, index, labels) {
                  return numeral(label).format('0.0 a').toUpperCase();
                },
                beginAtZero: true,
                // stepSize: 100,
                // min: 300,
                // max: 800,
                padding: 20
              }
            }
          ],
          xAxes: [{
            type: 'time',
            distribution: 'series',
            offset: true,
            gridLines: {
              display: false
            },
            time: {
              displayFormats: {
                hour:	'MMM D',
                day:	'MMM D'
              }
            },
            ticks: {
              source: 'data',
              autoSkip: true,
              //autoSkipPadding: 420
            }
          }]
        },
        legend: {
          position: "bottom",
          labels: {
            padding: 30,
            usePointStyle: true,
            fontSize: 12
          }
        },
        tooltips: chartTooltip
      },
      data: {
        labels: [],
        datasets: [
          {
            label: "Deposits",
            borderColor: themeColor1,
            backgroundColor: themeColor1_10,
            data: [],
            borderWidth: 2
          },
          {
            label: "Withdrawals",
            borderColor: themeColor2,
            backgroundColor: themeColor2_10,
            data: [],
            borderWidth: 2
          }
        ]
      }
    });

    const investDataAll= await $.ajax({
      url: CHART_API_URL+'/invest_data_all'
    });

    const withdrawDataAll = await $.ajax({
      url: CHART_API_URL+'/withdraw_data_all'
    });
    chartAll.data.datasets[0].data = investDataAll
    chartAll.data.datasets[1].data = withdrawDataAll

    chartAll.update()
  }





}
