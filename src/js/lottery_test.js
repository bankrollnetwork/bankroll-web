
//mapping => uint as index,

// Array [ {
// 	address,
// 	amount_of_tickets,
// 	start_pos (virtual array positions),
// 	end_pos,
// }]

// TODO: add 'Reset' function, clear user stats


let tickets = []
let ticketsAmount = 0

function addTickets(address, amount) {
    tickets.push({
        address: address,
        amount_of_tickets: amount,
        start_pos: ticketsAmount,
        end_pos: ticketsAmount + amount - 1
    });
    ticketsAmount += amount;
    console.log(tickets);
}

function binarySearchTicket (list, value) {
    // initial values for start, middle and end
    let start = 0
    let stop = list.length - 1
    let middle = Math.floor((start + stop) / 2)


    function hasThisValue(listItem, val) {
        return listItem.start_pos<=val && listItem.end_pos>=val;
    }

    function moreThanValue(listItem, val) {
        return listItem.start_pos>=val;
    }
  
    // While the middle is not what we're looking for and the list does not have a single item
    while ( !hasThisValue(list[middle], value) && start < stop) {
      if (moreThanValue(list[middle], value)) {
        stop = middle - 1
      } else {
        start = middle + 1
      }
  
      // recalculate middle on every iteration
      middle = Math.floor((start + stop) / 2)
    }
  
    // if the current middle item is what we're looking for return it's index, else return -1
    return (!hasThisValue(list[middle], value)) ? -1 : middle
  }

function pickTicket() {
    const randomTicket = Math.floor(Math.random()*ticketsAmount);
    console.log('randomTicket', randomTicket);
    const arrayIndex = binarySearchTicket(tickets, randomTicket);
    console.log('foundArrayItem', tickets[arrayIndex]);
    return { item: tickets[arrayIndex], ticketNumber: randomTicket};
}

$('#addTicketBtn').on('click', ()=>{
  const addr = $('#walletAddrInp').val();
  const ticketsAmount = parseInt( $('#ticketsAmountInp').val() );
  addTickets(addr, ticketsAmount);
})

$('#pickTicketBtn').on('click', ()=>{
  const pickedObj = pickTicket();
  $('#pickedTicketLbl').html(pickedObj.ticketNumber);
  $('#winWalletLbl').html(pickedObj.item.address);
})


// addTickets('tydfajsdbjfbasd', 35);
// addTickets('dfakjdsfjsdfdas', 70);
// addTickets('tydfajsdbjfbasd', 15);
// addTickets('12313213dasdasd', 15);
// addTickets('0sanasjdndnjaks', 20);
// console.log(pickTicket());